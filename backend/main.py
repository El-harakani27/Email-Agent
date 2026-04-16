from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from api.routes import router
from api.users import router as users_router
from api.todos import router as todos_router

app = FastAPI(title="Email Flow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(users_router)
app.include_router(todos_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
