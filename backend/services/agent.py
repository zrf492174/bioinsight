"""BioInsight AI Agent Service — Poe LLM integration with tool calling."""

import os
import json
import asyncio
import re
from typing import AsyncGenerator, Any, Callable, Optional
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Load environment variables from the project root .env
_env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(_env_path)

POE_API_KEY = os.getenv("poe_api") or os.getenv("POE_API_KEY") or ""
DEFAULT_BOT = "Gemini-3.1-Pro"


# ── Tool Registry ──────────────────────────────────────────────────────────

class ToolDefinition:
    """Describes a tool the agent can invoke."""

    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable[..., Any],
    ):
        self.name = name
        self.description = description
        self.parameters = parameters  # JSON-schema style
        self.handler = handler

    def schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }


# ── Built-in tool handlers ─────────────────────────────────────────────────

def _read_webpage(url: str, max_chars: int = 6000) -> dict:
    """Fetch a web page URL and extract its main text content."""
    try:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove noise tags
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title and soup.title.string else ""
        text = soup.get_text(separator="\n", strip=True)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n...(内容已截断)"

        return {"success": True, "title": title, "content": text}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _run_diff_analysis(gene_list: str = "", fc_threshold: float = 1.0, pvalue_threshold: float = 0.05) -> dict:
    """Placeholder: would trigger a diff analysis on the backend."""
    return {
        "success": True,
        "message": f"差异分析已提交 (fc≥{fc_threshold}, p<{pvalue_threshold})",
        "hint": "请前往「差异表达分析」页面上传数据并运行完整分析。",
    }


def _run_go_enrichment(gene_list: str = "", pvalue_cutoff: float = 0.05) -> dict:
    """Placeholder: would trigger GO enrichment analysis."""
    return {
        "success": True,
        "message": f"GO 富集分析已提交 (p<{pvalue_cutoff})",
        "hint": "请前往「GO 富集分析」页面查看完整结果。",
    }


def _run_kegg_enrichment(gene_list: str = "", pvalue_cutoff: float = 0.05) -> dict:
    """Placeholder: would trigger KEGG enrichment analysis."""
    return {
        "success": True,
        "message": f"KEGG 富集分析已提交 (p<{pvalue_cutoff})",
        "hint": "请前往「KEGG 富集分析」页面查看完整结果。",
    }


def _run_gene_convert(gene_list: str = "", from_type: str = "auto") -> dict:
    """Placeholder: would trigger gene name conversion."""
    return {
        "success": True,
        "message": f"基因名转换已提交 (from_type={from_type})",
        "hint": "请前往「基因名转换」页面查看完整结果。",
    }


def _run_ppi_analysis(gene_list: str = "", species: int = 9606) -> dict:
    """Placeholder: would trigger PPI network analysis."""
    return {
        "success": True,
        "message": f"PPI 分析已提交 (species={species})",
        "hint": "请前往「PPI 分析」页面查看互作网络。",
    }


# ── Register all tools ─────────────────────────────────────────────────────

TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="read_webpage",
        description="读取并提取给定URL网页的文本内容。用于获取在线资料、文献信息或任何网页内容。",
        parameters={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "要读取的网页URL"},
                "max_chars": {
                    "type": "integer",
                    "description": "最大返回字符数，默认6000",
                    "default": 6000,
                },
            },
            "required": ["url"],
        },
        handler=_read_webpage,
    ),
    ToolDefinition(
        name="diff_analysis",
        description="运行差异表达基因分析。分析对照组与实验组之间的差异基因。",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {"type": "string", "description": "基因列表（逗号分隔）"},
                "fc_threshold": {"type": "number", "description": "Fold change 阈值", "default": 1.0},
                "pvalue_threshold": {"type": "number", "description": "P值阈值", "default": 0.05},
            },
            "required": [],
        },
        handler=_run_diff_analysis,
    ),
    ToolDefinition(
        name="go_enrichment",
        description="执行GO功能富集分析。分析基因列表中显著富集的GO terms。",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {"type": "string", "description": "基因列表（逗号分隔）"},
                "pvalue_cutoff": {"type": "number", "description": "P值截断", "default": 0.05},
            },
            "required": ["gene_list"],
        },
        handler=_run_go_enrichment,
    ),
    ToolDefinition(
        name="kegg_enrichment",
        description="执行KEGG通路富集分析。分析基因列表中显著富集的KEGG pathways。",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {"type": "string", "description": "基因列表（逗号分隔）"},
                "pvalue_cutoff": {"type": "number", "description": "P值截断", "default": 0.05},
            },
            "required": ["gene_list"],
        },
        handler=_run_kegg_enrichment,
    ),
    ToolDefinition(
        name="gene_convert",
        description="基因名称格式转换。支持Symbol、Ensembl、Entrez等格式之间的转换。",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {"type": "string", "description": "基因列表（逗号分隔）"},
                "from_type": {"type": "string", "description": "源格式类型", "default": "auto"},
            },
            "required": ["gene_list"],
        },
        handler=_run_gene_convert,
    ),
    ToolDefinition(
        name="ppi_analysis",
        description="蛋白质-蛋白质相互作用网络分析。基于STRING数据库构建PPI网络。",
        parameters={
            "type": "object",
            "properties": {
                "gene_list": {"type": "string", "description": "基因列表（逗号分隔）"},
                "species": {"type": "integer", "description": "物种NCBI Taxonomy ID", "default": 9606},
            },
            "required": ["gene_list"],
        },
        handler=_run_ppi_analysis,
    ),
]

TOOL_MAP: dict[str, ToolDefinition] = {t.name: t for t in TOOLS}


# ── Agent Service ───────────────────────────────────────────────────────────

def _build_system_prompt() -> str:
    """Build a system prompt that tells the LLM about available tools."""
    tools_desc = json.dumps([t.schema() for t in TOOLS], ensure_ascii=False, indent=2)
    return f"""你是 BioInsight AI 助手，一个生物信息学分析平台的智能助理。

你可以使用以下工具来帮助用户完成任务：

{tools_desc}

当你需要使用工具时，请严格按照以下JSON格式输出工具调用，不要添加任何额外内容在这一行：
[TOOL_CALL]{{"name": "工具名称", "arguments": {{"参数名": "参数值"}}}}[/TOOL_CALL]

重要规则：
1. 工具调用必须是单独的一行，格式严格为 [TOOL_CALL]...json...[/TOOL_CALL]
2. 你可以在文字中穿插工具调用，但每个调用必须独占一行
3. 工具执行结果会以 [TOOL_RESULT] 格式返回给你，你需要根据结果继续回答用户
4. 如果用户的问题不需要工具，直接用文字回答即可
5. 你是生物信息学专家，请用专业且易懂的中文回答问题"""


def execute_tool(tool_name: str, arguments: dict) -> dict:
    """Execute a registered tool and return its result."""
    tool = TOOL_MAP.get(tool_name)
    if not tool:
        return {"success": False, "error": f"未知工具: {tool_name}"}
    try:
        result = tool.handler(**arguments)
        return result
    except Exception as e:
        return {"success": False, "error": f"工具执行失败: {str(e)}"}


_TOOL_CALL_PATTERN = re.compile(
    r"\[TOOL_CALL\](.*?)\[/TOOL_CALL\]", re.DOTALL
)


async def agent_chat_stream(
    messages: list[dict],
    bot_name: str = DEFAULT_BOT,
    api_key: str = "",
) -> AsyncGenerator[dict, None]:
    """
    Run the agent loop with streaming output.

    Yields SSE-style dicts:
      {"event": "token",       "data": "partial text"}
      {"event": "tool_call",   "data": {"name": ..., "arguments": ...}}
      {"event": "tool_result", "data": {"name": ..., "result": ...}}
      {"event": "done",        "data": ""}
      {"event": "error",       "data": "error message"}
    """
    import fastapi_poe as fp

    key = api_key or POE_API_KEY
    if not key:
        yield {"event": "error", "data": "POE API Key 未配置，请在 .env 中设置"}
        return

    system_prompt = _build_system_prompt()

    # Build protocol messages
    protocol_messages = [
        fp.ProtocolMessage(role="system", content=system_prompt)
    ]
    for msg in messages:
        protocol_messages.append(
            fp.ProtocolMessage(role=msg.get("role", "user"), content=msg.get("content", ""))
        )

    max_tool_rounds = 5
    for _round in range(max_tool_rounds):
        full_response = ""
        buffer = ""

        try:
            async for partial in fp.get_bot_response(
                messages=protocol_messages,
                bot_name=bot_name,
                api_key=key,
            ):
                if getattr(partial, "is_replace_response", False):
                    full_response = partial.text
                    buffer = partial.text
                    yield {"event": "replace", "data": partial.text}
                    continue

                chunk = partial.text
                full_response += chunk
                buffer += chunk

                # Check if buffer contains a complete tool call
                tool_match = _TOOL_CALL_PATTERN.search(buffer)
                if tool_match:
                    # Emit any text before the tool call
                    pre_text = buffer[: tool_match.start()]
                    if pre_text.strip():
                        yield {"event": "token", "data": pre_text}

                    # Parse and execute tool call
                    try:
                        tool_json = json.loads(tool_match.group(1))
                        tool_name = tool_json.get("name", "")
                        tool_args = tool_json.get("arguments", {})

                        yield {"event": "tool_call", "data": {"name": tool_name, "arguments": tool_args}}

                        result = execute_tool(tool_name, tool_args)
                        yield {"event": "tool_result", "data": {"name": tool_name, "result": result}}

                        # Reset buffer past the tool call
                        buffer = buffer[tool_match.end():]
                    except json.JSONDecodeError:
                        # Not valid JSON yet, keep buffering
                        yield {"event": "token", "data": buffer}
                        buffer = ""
                else:
                    # No tool call pattern started — stream tokens, but keep a tail
                    # in case [TOOL_CALL] is partially in buffer
                    safe_boundary = buffer.rfind("[TOOL_CALL]")
                    if safe_boundary == -1 and "[" not in buffer:
                        # No potential tool call start, safe to emit
                        yield {"event": "token", "data": buffer}
                        buffer = ""
                    elif safe_boundary == -1 and len(buffer) > 200:
                        # Buffer is getting large but no tool call start found
                        yield {"event": "token", "data": buffer}
                        buffer = ""

        except Exception as e:
            yield {"event": "error", "data": str(e)}
            return

        # Emit any remaining buffered text
        if buffer.strip():
            # Check one more time for tool calls
            tool_match = _TOOL_CALL_PATTERN.search(buffer)
            if tool_match:
                pre_text = buffer[: tool_match.start()]
                if pre_text.strip():
                    yield {"event": "token", "data": pre_text}
                try:
                    tool_json = json.loads(tool_match.group(1))
                    tool_name = tool_json.get("name", "")
                    tool_args = tool_json.get("arguments", {})
                    yield {"event": "tool_call", "data": {"name": tool_name, "arguments": tool_args}}
                    result = execute_tool(tool_name, tool_args)
                    yield {"event": "tool_result", "data": {"name": tool_name, "result": result}}
                    remaining = buffer[tool_match.end():].strip()
                    if remaining:
                        yield {"event": "token", "data": remaining}
                except json.JSONDecodeError:
                    yield {"event": "token", "data": buffer}
                buffer = ""
            else:
                yield {"event": "token", "data": buffer}
                buffer = ""

        # If a tool was called this round, feed the result back for a follow-up
        if any(
            _TOOL_CALL_PATTERN.search(full_response) for _ in [1]
        ):
            tool_match = _TOOL_CALL_PATTERN.search(full_response)
            if tool_match:
                try:
                    tool_json = json.loads(tool_match.group(1))
                    tool_name = tool_json.get("name", "")
                    tool_args = tool_json.get("arguments", {})
                    result = execute_tool(tool_name, tool_args)

                    # Append assistant response and tool result to messages
                    protocol_messages.append(
                        fp.ProtocolMessage(role="assistant", content=full_response)
                    )
                    protocol_messages.append(
                        fp.ProtocolMessage(
                            role="user",
                            content=f"[TOOL_RESULT]{json.dumps(result, ensure_ascii=False)}[/TOOL_RESULT]\n请基于以上工具返回的结果回答用户的问题。",
                        )
                    )
                    # Continue to next round
                    continue
                except json.JSONDecodeError:
                    pass

        # No tool call — we're done
        break

    yield {"event": "done", "data": ""}


def get_available_tools() -> list[dict]:
    """Return the list of tools with their schemas."""
    return [t.schema() for t in TOOLS]
