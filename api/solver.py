from __future__ import annotations

from typing import Any, Dict, List, Tuple

import sympy as sp

MAX_DIM = 10


def _parse_number(s: str) -> sp.Expr:
    s = str(s).strip()
    if s == "":
        return sp.Integer(0)
    try:
        return sp.Rational(s)
    except Exception:
        try:
            return sp.nsimplify(s)
        except Exception as exc:
            raise ValueError(f"Некорректное число: '{s}'") from exc


def _to_matrix(raw: List[List[str]], name: str) -> sp.Matrix:
    if not raw or not isinstance(raw, list) or not all(isinstance(r, list) for r in raw):
        raise ValueError(f"Матрица {name} пустая или имеет неверный формат.")

    rows = len(raw)
    cols = len(raw[0]) if raw and isinstance(raw[0], list) else 0
    if cols == 0:
        raise ValueError(f"Матрица {name} пустая.")
    if any(len(r) != cols for r in raw):
        raise ValueError(f"Матрица {name} должна быть прямоугольной (все строки одной длины).")
    if rows > MAX_DIM or cols > MAX_DIM:
        raise ValueError(
            f"Матрица {name} превышает лимит {MAX_DIM}x{MAX_DIM}. "
            f"Сейчас размер: {_dims_from_raw(rows, cols)}."
        )

    data = [[_parse_number(raw[i][j]) for j in range(cols)] for i in range(rows)]
    return sp.Matrix(data)


def _dims_from_raw(rows: int, cols: int) -> str:
    return f"{rows}x{cols}"


def _mat_latex(M: sp.Matrix) -> str:
    return sp.latex(M, mat_delim="[")


def _dims(M: sp.Matrix) -> str:
    return f"{M.rows}x{M.cols}"


def _expr_text(expr: sp.Expr) -> str:
    return str(sp.simplify(expr))


def _matrix_text(M: sp.Matrix) -> str:
    rows = []
    for i in range(M.rows):
        rows.append("\t".join(_expr_text(M[i, j]) for j in range(M.cols)))
    return "\n".join(rows)


def _li(tex: str, note: str | None = None) -> str:
    if note:
        return f"{tex}<div class='small'>{note}</div>"
    return tex


def _steps_add(A: sp.Matrix, B: sp.Matrix) -> Tuple[sp.Matrix, List[str]]:
    if A.shape != B.shape:
        raise ValueError(f"Сложение невозможно: A={_dims(A)}, B={_dims(B)}. Требуется одинаковый размер.")

    C = A + B
    steps: List[str] = [
        _li(r"$c_{ij}=a_{ij}+b_{ij}$", "Складываем элементы с одинаковыми индексами."),
        _li(rf"$A={_mat_latex(A)},\; B={_mat_latex(B)}$", "Размеры совпадают, значит сложение допустимо."),
    ]

    for i in range(A.rows):
        for j in range(A.cols):
            steps.append(
                _li(
                    rf"$c_{{{i+1},{j+1}}}={sp.latex(A[i, j])}+{sp.latex(B[i, j])}={sp.latex(C[i, j])}$",
                    f"Элемент ({i+1}, {j+1}).",
                )
            )

    steps.append(_li(rf"$C={_mat_latex(C)}$", "Результат сложения."))
    return C, steps


def _steps_mul(A: sp.Matrix, B: sp.Matrix) -> Tuple[sp.Matrix, List[str]]:
    if A.cols != B.rows:
        raise ValueError(
            f"Умножение невозможно: cols(A)={A.cols}, rows(B)={B.rows}. "
            f"Размеры: A={_dims(A)}, B={_dims(B)}."
        )

    C = A * B
    steps: List[str] = [
        _li(
            r"$c_{ij}=\sum_{k=1}^{m} a_{ik} b_{kj}$",
            "Каждый элемент результата - это скалярное произведение строки A и столбца B.",
        ),
        _li(
            rf"$A={_mat_latex(A)},\; B={_mat_latex(B)}$",
            f"Внутренние размеры совпадают: {A.cols} = {B.rows}.",
        ),
    ]

    for i in range(C.rows):
        for j in range(C.cols):
            parts = []
            for k in range(A.cols):
                parts.append(rf"{sp.latex(A[i, k])}\cdot {sp.latex(B[k, j])}")
            sum_tex = " + ".join(parts) if parts else "0"
            steps.append(
                _li(
                    rf"$c_{{{i+1},{j+1}}}={sum_tex}={sp.latex(sp.simplify(C[i, j]))}$",
                    f"Строка {i+1} матрицы A на столбец {j+1} матрицы B.",
                )
            )

    steps.append(_li(rf"$C={_mat_latex(C)}$", "Результат умножения."))
    return C, steps


def _steps_transpose(M: sp.Matrix, name: str) -> Tuple[sp.Matrix, List[str]]:
    T = M.T
    steps: List[str] = [
        _li(r"$t_{ij}=m_{ji}$", "Меняем строки и столбцы местами."),
        _li(rf"${name}={_mat_latex(M)}$", "Исходная матрица."),
    ]

    for i in range(T.rows):
        for j in range(T.cols):
            steps.append(
                _li(
                    rf"$t_{{{i+1},{j+1}}}=m_{{{j+1},{i+1}}}={sp.latex(M[j, i])}$",
                    f"Элемент ({i+1}, {j+1}) транспонированной матрицы.",
                )
            )

    steps.append(_li(rf"${name}^T={_mat_latex(T)}$", "Результат транспонирования."))
    return T, steps


def _det_by_elimination(M: sp.Matrix) -> Tuple[sp.Expr, List[str]]:
    if M.rows != M.cols:
        raise ValueError(f"Определитель невозможен: матрица не квадратная ({_dims(M)}).")

    A = sp.Matrix(M)
    n = A.rows
    steps: List[str] = [
        _li(r"$\det(A)$", "Приведем матрицу к верхнетреугольному виду методом Гаусса."),
        _li(rf"$A={_mat_latex(A)}$", f"Размер матрицы: {_dims(M)}."),
    ]

    det_factor = sp.Integer(1)

    for col in range(n):
        pivot = None
        for r in range(col, n):
            if A[r, col] != 0:
                pivot = r
                break

        if pivot is None:
            steps.append(_li(r"$\Rightarrow$ в текущем столбце нет ненулевого pivot, значит $\det(A)=0$."))
            return sp.Integer(0), steps

        if pivot != col:
            A.row_swap(pivot, col)
            det_factor *= -1
            steps.append(
                _li(
                    rf"$R_{{{col+1}}}\leftrightarrow R_{{{pivot+1}}}$, $A={_mat_latex(A)}$",
                    "При перестановке двух строк знак определителя меняется.",
                )
            )

        pivot_val = A[col, col]
        steps.append(
            _li(
                rf"Pivot в столбце {col+1}: $a_{{{col+1},{col+1}}}={sp.latex(pivot_val)}$",
                "Используем его, чтобы занулить элементы ниже.",
            )
        )

        for r in range(col + 1, n):
            if A[r, col] == 0:
                continue
            factor = sp.Rational(A[r, col], pivot_val)
            A.row_op(r, lambda v, j: v - factor * A[col, j])
            steps.append(
                _li(
                    rf"$R_{{{r+1}}}\leftarrow R_{{{r+1}}} - \left({sp.latex(factor)}\right)R_{{{col+1}}}$, $A={_mat_latex(A)}$",
                    f"Зануляем элемент под pivot в строке {r+1}.",
                )
            )

    det_val = det_factor
    diag = []
    for i in range(n):
        diag.append(A[i, i])
        det_val *= A[i, i]

    steps.append(
        _li(
            rf"Треугольная матрица получена, поэтому $\det(A)=({sp.latex(det_factor)})\cdot "
            + r"\cdot ".join(sp.latex(x) for x in diag)
            + rf"={sp.latex(sp.simplify(det_val))}$",
            "Определитель треугольной матрицы равен произведению диагональных элементов с учетом перестановок строк.",
        )
    )
    return sp.simplify(det_val), steps


def _inverse_gauss_jordan(M: sp.Matrix, name: str) -> Tuple[sp.Matrix, List[str]]:
    if M.rows != M.cols:
        raise ValueError(f"Обратная невозможна: матрица не квадратная ({_dims(M)}).")

    det_val = sp.simplify(M.det())
    if det_val == 0:
        raise ValueError(f"Обратная невозможна: det({name}) = 0 (матрица вырожденная).")

    n = M.rows
    A = sp.Matrix(M)
    I = sp.eye(n)
    Aug = A.row_join(I)

    steps: List[str] = [
        _li(r"$[A\,|\,I] \to [I\,|\,A^{-1}]$", "Метод Гаусса-Жордана."),
        _li(rf"$\det({name})={sp.latex(det_val)} \neq 0$", "Обратимая матрица существует."),
        _li(rf"$[A\,|\,I]={_mat_latex(Aug)}$", "Строим расширенную матрицу."),
    ]

    for col in range(n):
        pivot = None
        for r in range(col, n):
            if Aug[r, col] != 0:
                pivot = r
                break
        if pivot is None:
            raise ValueError(f"Обратная невозможна: не найден pivot в столбце {col+1}.")

        if pivot != col:
            Aug.row_swap(pivot, col)
            steps.append(
                _li(
                    rf"$R_{{{col+1}}}\leftrightarrow R_{{{pivot+1}}}$, $[A|I]={_mat_latex(Aug)}$",
                    "Переставляем строки, чтобы получить ненулевой pivot.",
                )
            )

        pivot_val = Aug[col, col]
        if pivot_val != 1:
            Aug.row_op(col, lambda v, j: v / pivot_val)
            steps.append(
                _li(
                    rf"$R_{{{col+1}}}\leftarrow \frac{{1}}{{{sp.latex(pivot_val)}}}R_{{{col+1}}}$, $[A|I]={_mat_latex(Aug)}$",
                    "Нормируем ведущий элемент до 1.",
                )
            )

        for r in range(n):
            if r == col or Aug[r, col] == 0:
                continue
            factor = Aug[r, col]
            Aug.row_op(r, lambda v, j: v - factor * Aug[col, j])
            steps.append(
                _li(
                    rf"$R_{{{r+1}}}\leftarrow R_{{{r+1}}} - ({sp.latex(factor)})R_{{{col+1}}}$, $[A|I]={_mat_latex(Aug)}$",
                    f"Обнуляем элемент в столбце {col+1}, строке {r+1}.",
                )
            )

    inv = Aug[:, n:]
    steps.append(_li(rf"$\Rightarrow {name}^{{-1}}={_mat_latex(inv)}$", "Правая часть расширенной матрицы стала обратной матрицей."))
    return inv, steps


def solve_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    A = _to_matrix(payload["A"], "A")
    B = _to_matrix(payload["B"], "B")
    op = payload.get("op")
    target = payload.get("target", "A")

    if A.rows == 0 or A.cols == 0:
        raise ValueError("Матрица A пустая.")
    if B.rows == 0 or B.cols == 0:
        raise ValueError("Матрица B пустая.")

    base_response = {
        "matrix_a_shape": [A.rows, A.cols],
        "matrix_b_shape": [B.rows, B.cols],
        "matrix_a_text": _matrix_text(A),
        "matrix_b_text": _matrix_text(B),
    }

    if op == "add":
        C, steps = _steps_add(A, B)
        return {
            **base_response,
            "source_latex": rf"{_mat_latex(A)} + {_mat_latex(B)}",
            "source_text": "A + B",
            "calc_latex": r"A + B",
            "calc_text": "A + B",
            "steps": steps,
            "result_latex": _mat_latex(C),
            "result_text": _matrix_text(C),
            "result_shape": [C.rows, C.cols],
            "result_kind": "matrix",
        }

    if op == "mul":
        C, steps = _steps_mul(A, B)
        return {
            **base_response,
            "source_latex": rf"{_mat_latex(A)} \cdot {_mat_latex(B)}",
            "source_text": "A · B",
            "calc_latex": r"A \cdot B",
            "calc_text": "A · B",
            "steps": steps,
            "result_latex": _mat_latex(C),
            "result_text": _matrix_text(C),
            "result_shape": [C.rows, C.cols],
            "result_kind": "matrix",
        }

    M = A if target == "A" else B
    name = target

    if op == "transpose":
        T, steps = _steps_transpose(M, name)
        return {
            **base_response,
            "source_latex": rf"{_mat_latex(M)}^T",
            "source_text": rf"{name}^T",
            "calc_latex": rf"{name}^T",
            "calc_text": rf"{name}^T",
            "steps": steps,
            "result_latex": _mat_latex(T),
            "result_text": _matrix_text(T),
            "result_shape": [T.rows, T.cols],
            "result_kind": "matrix",
        }

    if op == "det":
        det_val, steps = _det_by_elimination(M)
        return {
            **base_response,
            "source_latex": rf"\det({name})",
            "source_text": rf"det({name})",
            "calc_latex": rf"\det({name})",
            "calc_text": rf"det({name})",
            "steps": steps,
            "result_latex": sp.latex(det_val),
            "result_text": _expr_text(det_val),
            "result_shape": None,
            "result_kind": "scalar",
        }

    if op == "inv":
        inv, steps = _inverse_gauss_jordan(M, name)
        return {
            **base_response,
            "source_latex": rf"{name}^{{-1}}",
            "source_text": rf"{name}^-1",
            "calc_latex": rf"{name}^{{-1}}",
            "calc_text": rf"{name}^-1",
            "steps": steps,
            "result_latex": _mat_latex(inv),
            "result_text": _matrix_text(inv),
            "result_shape": [inv.rows, inv.cols],
            "result_kind": "matrix",
        }

    raise ValueError("Неизвестная операция.")
