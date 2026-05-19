(function(){
  const MAX_DIM = 10;

  const gridEl = document.getElementById('matrixGrid');
  const sizeLabel = document.getElementById('sizeLabel');
  const rowsValueEl = document.getElementById('rowsValue');
  const colsValueEl = document.getElementById('colsValue');
  const presetEl = document.getElementById('preset');
  const scaleEl = document.getElementById('scale');
  const normalizeEl = document.getElementById('normalize');
  const methodEl = document.getElementById('method');
  const cellSizeEl = document.getElementById('cellSize');
  const statsBox = document.getElementById('statsBox');
  const hintBox = document.getElementById('hintBox');
  const legendEl = document.getElementById('legend');
  const canvas = document.getElementById('vizCanvas');
  const ctx = canvas.getContext('2d');

  const btnRowsPlus = document.getElementById('btnRowsPlus');
  const btnRowsMinus = document.getElementById('btnRowsMinus');
  const btnColsPlus = document.getElementById('btnColsPlus');
  const btnColsMinus = document.getElementById('btnColsMinus');
  const btnReset = document.getElementById('btnReset');

  let rows = 6;
  let cols = 6;
  let M = makeMatrix(rows, cols, 0);

  function makeMatrix(r, c, val){
    return Array.from({length:r}, ()=>Array.from({length:c}, ()=>val));
  }

  function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }
  function isFiniteNumber(x){ return Number.isFinite(x) && !Number.isNaN(x); }

  function resize(axis, delta){
    if (axis === 'rows') rows = clamp(rows + delta, 1, MAX_DIM);
    if (axis === 'cols') cols = clamp(cols + delta, 1, MAX_DIM);
    const next = makeMatrix(rows, cols, 0);
    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        next[i][j] = M[i]?.[j] ?? 0;
      }
    }
    setMatrix(next);
    presetEl.value = 'user';
  }

  function matrixStats(A){
    let min = Infinity, max = -Infinity, sum=0, cnt=0, nnz=0;
    for(const row of A){
      for(const v of row){
        const x = isFiniteNumber(v) ? v : 0;
        min = Math.min(min, x);
        max = Math.max(max, x);
        sum += x; cnt++;
        if (x !== 0) nnz++;
      }
    }
    const mean = cnt ? (sum/cnt) : 0;
    return {min, max, mean, nnz, cnt};
  }

  function format3(x){
    if (!isFiniteNumber(x)) return '0.000';
    return (Math.round(x*1000)/1000).toFixed(3);
  }

  function setHint(){
    const mode = methodEl.value;
    if (mode === 'heatmap'){
      hintBox.innerHTML = 'Heatmap: цвет клетки кодирует значение элемента a<sub>ij</sub>.';
    } else if (mode === 'image'){
      hintBox.innerHTML = 'Изображение: матрица интерпретируется как двумерный массив пикселей (яркость ~ a<sub>ij</sub>).';
    } else {
      hintBox.innerHTML = 'Гистограммы: визуализация сумм по строкам и столбцам для прямоугольных и квадратных матриц.';
    }
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  function divergingColor(v, maxAbs){
    const t = maxAbs === 0 ? 0.5 : (v / maxAbs);
    if (t < 0){
      const u = clamp(-t, 0, 1);
      return [
        Math.round(lerp(255, 0, u)),
        Math.round(lerp(255, 90, u)),
        Math.round(lerp(255, 200, u))
      ];
    }
    const u = clamp(t, 0, 1);
    return [
      Math.round(lerp(255, 220, u)),
      Math.round(lerp(255, 50, u)),
      Math.round(lerp(255, 30, u))
    ];
  }

  function sequentialColor(v, vmin, vmax){
    const t = (vmax === vmin) ? 0 : (v - vmin) / (vmax - vmin);
    const u = clamp(t, 0, 1);
    return [
      Math.round(lerp(255, 220, u)),
      Math.round(lerp(255, 50, u)),
      Math.round(lerp(255, 30, u))
    ];
  }

  function grayColor(v, vmin, vmax){
    const t = (vmax === vmin) ? 0 : (v - vmin) / (vmax - vmin);
    const u = clamp(t, 0, 1);
    const g = Math.round(lerp(240, 20, u));
    return [g,g,g];
  }

  function getValueForColor(v, stats){
    const scale = scaleEl.value;
    if (scale === 'diverging'){
      return {meta:{maxAbs: Math.max(Math.abs(stats.min), Math.abs(stats.max))}};
    }
    return {meta:{vmin:stats.min, vmax:stats.max}};
  }

  function buildGrid(){
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${cols}, 64px)`;
    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = 'any';
        inp.value = M[i][j] ?? 0;
        inp.dataset.i = String(i);
        inp.dataset.j = String(j);
        inp.addEventListener('input', (e)=>{
          const ii = parseInt(e.target.dataset.i,10);
          const jj = parseInt(e.target.dataset.j,10);
          const val = parseFloat(e.target.value);
          M[ii][jj] = isFiniteNumber(val) ? val : 0;
          renderAll();
        });
        gridEl.appendChild(inp);
      }
    }
    sizeLabel.textContent = `${rows}x${cols}`;
    rowsValueEl.textContent = String(rows);
    colsValueEl.textContent = String(cols);
  }

  function setMatrix(A){
    rows = clamp(A.length, 1, MAX_DIM);
    cols = clamp(A[0]?.length || 1, 1, MAX_DIM);
    M = makeMatrix(rows, cols, 0);
    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        M[i][j] = A[i]?.[j] ?? 0;
      }
    }
    buildGrid();
    renderAll();
  }

  function applyPreset(){
    const p = presetEl.value;
    if (p === 'user') { renderAll(); return; }

    if (p === 'random'){
      const A = makeMatrix(rows, cols, 0);
      for(let i=0;i<rows;i++){
        for(let j=0;j<cols;j++){
          A[i][j] = Math.floor(Math.random()*11) - 5;
        }
      }
      setMatrix(A); return;
    }

    if (p === 'identity'){
      const A = makeMatrix(rows, cols, 0);
      const diag = Math.min(rows, cols);
      for(let i=0;i<diag;i++) A[i][i] = 1;
      setMatrix(A); return;
    }

    if (p === 'symmetric'){
      const A = makeMatrix(rows, cols, 0);
      const side = Math.min(rows, cols);
      for(let i=0;i<side;i++){
        for(let j=i;j<side;j++){
          const v = Math.floor(Math.random()*11)-5;
          A[i][j] = v;
          A[j][i] = v;
        }
      }
      for(let i=0;i<rows;i++){
        for(let j=side;j<cols;j++){
          A[i][j] = Math.floor(Math.random()*11)-5;
        }
      }
      for(let i=side;i<rows;i++){
        for(let j=0;j<Math.min(side, cols);j++){
          A[i][j] = Math.floor(Math.random()*11)-5;
        }
      }
      setMatrix(A); return;
    }

    if (p === 'adj'){
      const A = makeMatrix(rows, cols, 0);
      for(let i=0;i<rows;i++){
        for(let j=0;j<cols;j++){
          A[i][j] = (i === j) ? 0 : ((Math.random() < 0.25) ? 1 : 0);
        }
      }
      setMatrix(A); return;
    }
  }

  function drawHeatmap(A, cell){
    const stats = matrixStats(A);
    const scale = scaleEl.value;

    const pad = 10;
    const w = pad*2 + cols*cell;
    const h = pad*2 + rows*cell;
    canvas.width = Math.max(300, w);
    canvas.height = Math.max(300, h);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const ox = Math.floor((canvas.width - w)/2) + pad;
    const oy = Math.floor((canvas.height - h)/2) + pad;

    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        const v = isFiniteNumber(A[i][j]) ? A[i][j] : 0;
        const {meta} = getValueForColor(v, stats);
        let rgb;
        if (scale === 'diverging') rgb = divergingColor(v, meta.maxAbs);
        else if (scale === 'grayscale') rgb = grayColor(v, meta.vmin, meta.vmax);
        else rgb = sequentialColor(v, meta.vmin, meta.vmax);

        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(ox + j*cell, oy + i*cell, cell, cell);
        ctx.strokeStyle = 'rgba(215,219,234,1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + j*cell + 0.5, oy + i*cell + 0.5, cell, cell);
      }
    }

    const maxAbs = Math.max(Math.abs(stats.min), Math.abs(stats.max));
    if (scale === 'diverging'){
      legendEl.textContent = `Шкала: - (синий) -> 0 (светлый) -> + (красный). Диапазон: [${format3(-maxAbs)} ... ${format3(maxAbs)}]`;
    } else if (scale === 'grayscale'){
      legendEl.textContent = `Шкала: светлый -> тёмный. Диапазон: [${format3(stats.min)} ... ${format3(stats.max)}]`;
    } else {
      legendEl.textContent = `Шкала: светлый -> красный. Диапазон: [${format3(stats.min)} ... ${format3(stats.max)}]`;
    }
  }

  function drawImage(A, cell){
    const stats = matrixStats(A);
    const pad = 10;
    const w = pad*2 + cols*cell;
    const h = pad*2 + rows*cell;
    canvas.width = Math.max(300, w);
    canvas.height = Math.max(300, h);

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const ox = Math.floor((canvas.width - w)/2) + pad;
    const oy = Math.floor((canvas.height - h)/2) + pad;

    for(let i=0;i<rows;i++){
      for(let j=0;j<cols;j++){
        const v = isFiniteNumber(A[i][j]) ? A[i][j] : 0;
        const {meta} = getValueForColor(v, stats);
        const rgb = grayColor(v, meta.vmin, meta.vmax);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(ox + j*cell, oy + i*cell, cell, cell);
      }
    }

    ctx.strokeStyle = 'rgba(215,219,234,1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 0.5, oy + 0.5, cols*cell, rows*cell);

    legendEl.textContent = `Интерпретация как изображение: яркость ~ aij. Диапазон: [${format3(stats.min)} ... ${format3(stats.max)}]`;
  }

  function drawBars(A){
    const rowSums = A.map(r => r.reduce((s,v)=>s+(isFiniteNumber(v)?v:0), 0));
    const colSums = Array.from({length:cols}, (_,j)=>A.reduce((s,row)=>s+(isFiniteNumber(row[j])?row[j]:0), 0));

    const maxAbs = Math.max(
      1e-9,
      ...rowSums.map(x=>Math.abs(x)),
      ...colSums.map(x=>Math.abs(x))
    );

    const W = 760, H = 440;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,W,H);

    const margin = {l:50, r:30, t:30, b:45};
    const midX = Math.floor(W/2);
    const gap = 20;

    const area1 = {x: margin.l, y: margin.t, w: midX - margin.l - gap/2, h: H - margin.t - margin.b};
    const area2 = {x: midX + gap/2, y: margin.t, w: W - (midX + gap/2) - margin.r, h: H - margin.t - margin.b};

    drawBarArea(area1, rowSums, maxAbs, 'Суммы по строкам');
    drawBarArea(area2, colSums, maxAbs, 'Суммы по столбцам');
    legendEl.textContent = `Гистограммы агрегированных значений. Max |sum| = ${format3(maxAbs)}.`;

    function drawBarArea(area, data, maxAbsLocal, title){
      ctx.strokeStyle = 'rgba(215,219,234,1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(area.x+0.5, area.y+0.5, area.w, area.h);

      ctx.fillStyle = '#2b3a67';
      ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
      ctx.fillText(title, area.x+10, area.y+18);

      const baseY = area.y + area.h/2;
      ctx.strokeStyle = 'rgba(180,190,220,1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(area.x+8, baseY+0.5);
      ctx.lineTo(area.x+area.w-8, baseY+0.5);
      ctx.stroke();

      const barCount = data.length;
      const innerW = area.w - 20;
      const barW = Math.max(6, Math.floor(innerW / Math.max(barCount, 1)) - 4);
      const step = innerW / Math.max(barCount, 1);

      for(let k=0;k<barCount;k++){
        const v = data[k];
        const t = clamp(v / maxAbsLocal, -1, 1);
        const barH = Math.round((area.h/2 - 28) * Math.abs(t));
        const x = area.x + 10 + Math.floor(k*step + (step-barW)/2);
        const y = t >= 0 ? (baseY - barH) : baseY;
        const rgb = divergingColor(v, maxAbsLocal);

        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(x, y, barW, barH);

        if (barCount <= 12 || k % Math.ceil(barCount/12) === 0){
          ctx.fillStyle = '#3a4668';
          ctx.font = '700 11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.fillText(String(k+1), x, area.y + area.h + 18);
        }
      }
    }
  }

  function renderAll(){
    const stats = matrixStats(M);
    statsBox.textContent = `min=${format3(stats.min)} max=${format3(stats.max)} среднее=${format3(stats.mean)}\nненулевых=${stats.nnz}/${stats.cnt}`;
    setHint();

    const cell = clamp(parseInt(cellSizeEl.value || '26', 10), 8, 80);
    const mode = methodEl.value;
    if (mode === 'heatmap') drawHeatmap(M, cell);
    else if (mode === 'image') drawImage(M, cell);
    else drawBars(M);
  }

  presetEl.addEventListener('change', applyPreset);
  scaleEl.addEventListener('change', renderAll);
  normalizeEl.addEventListener('change', renderAll);
  methodEl.addEventListener('change', renderAll);
  cellSizeEl.addEventListener('input', renderAll);

  btnRowsPlus.addEventListener('click', ()=> resize('rows', +1));
  btnRowsMinus.addEventListener('click', ()=> resize('rows', -1));
  btnColsPlus.addEventListener('click', ()=> resize('cols', +1));
  btnColsMinus.addEventListener('click', ()=> resize('cols', -1));

  btnReset.addEventListener('click', ()=>{
    setMatrix(makeMatrix(rows, cols, 0));
    presetEl.value = 'user';
  });

  buildGrid();
  applyPreset();
  renderAll();
})();
