import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000";

/**
 * PATCH /api/todos/item/[todoId]
 * Update a todo's status, tags, title, or description.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { todoId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const res = await fetch(`${BACKEND}/todos/${params.todoId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return NextResponse.json(await res.json(), { status: res.status });
}

/**
 * DELETE /api/todos/item/[todoId]
 * Permanently delete a todo.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { todoId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${BACKEND}/todos/${params.todoId}`, {
    method: "DELETE",
  });

  return NextResponse.json(await res.json(), { status: res.status });
}
