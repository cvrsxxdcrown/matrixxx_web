from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Literal
from fastapi.middleware.cors import CORSMiddleware

from solver import solve_request

app = FastAPI(title="Matrixxx API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OpType = Literal["add", "mul", "transpose", "det", "inv"]
TargetType = Literal["A", "B"]

class ComputeRequest(BaseModel):
    A: List[List[str]] = Field(..., description="Matrix A (as strings)")
    B: List[List[str]] = Field(..., description="Matrix B (as strings)")
    op: OpType
    target: TargetType = "A"

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/api/compute")
def compute(req: ComputeRequest):
    try:
        return solve_request(req.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # на всякий — чтобы не падало без сообщения
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка: {e}")
