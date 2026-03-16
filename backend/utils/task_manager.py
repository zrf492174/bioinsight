import time
from typing import Dict, Any, Optional
from datetime import datetime
import asyncio

# Simple in-memory task store
# Structure:
# {
#   task_id: {
#     "id": str,
#     "status": "pending" | "running" | "completed" | "failed",
#     "created_at": timestamp,
#     "updated_at": timestamp,
#     "result": Any | None,
#     "error": str | None,
#     "meta": Dict # specific task metadata
#   }
# }
_TASKS: Dict[str, Dict[str, Any]] = {}

class TaskManager:
    @classmethod
    def create_task(cls, task_id: str, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Create a new task with 'pending' status."""
        now = datetime.utcnow().isoformat()
        task = {
            "id": task_id,
            "status": "pending",
            "created_at": now,
            "updated_at": now,
            "result": None,
            "error": None,
            "meta": meta or {}
        }
        _TASKS[task_id] = task
        return task

    @classmethod
    def get_task(cls, task_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve task by ID."""
        return _TASKS.get(task_id)

    @classmethod
    def update_task_status(cls, task_id: str, status: str, result: Any = None, error: str = None) -> Optional[Dict[str, Any]]:
        """Update task status, result, and/or error."""
        task = _TASKS.get(task_id)
        if not task:
            return None
        
        task["status"] = status
        task["updated_at"] = datetime.utcnow().isoformat()
        
        if result is not None:
            task["result"] = result
        if error is not None:
            task["error"] = error
            
        return task
