"""AI Agent API Router — SSE streaming chat with tool calling."""

import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from backend.services.agent import agent_chat_stream, get_available_tools

router = APIRouter(prefix="/api/agent", tags=["AI Agent"])


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    bot_name: Optional[str] = None


@router.post("/chat")
async def agent_chat(req: ChatRequest):
    """
    Stream an AI Agent conversation via SSE.

    Accepts a list of messages and returns a text/event-stream
    with events: token, tool_call, tool_result, done, error.
    """

    async def event_generator():
        messages_dicts = [{"role": m.role, "content": m.content} for m in req.messages]
        bot = req.bot_name or "Gemini-3.1-Pro"

        async for event in agent_chat_stream(messages_dicts, bot_name=bot):
            evt_type = event.get("event", "token")
            data = event.get("data", "")

            # Always JSON serialize data to safely handle newlines in SSE
            data_str = json.dumps(data, ensure_ascii=False)

            yield f"event: {evt_type}\ndata: {data_str}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_tools():
    """Return the list of available agent tools and their schemas."""
    return {"status": "success", "data": get_available_tools()}
