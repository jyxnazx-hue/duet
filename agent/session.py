from dataclasses import dataclass, field
from typing import List, Dict, Any

@dataclass
class WhiteboardElement:
    id: str
    element_type: str  # 'formula' | 'note' | 'shape'
    content: str
    timestamp: float

class DuetSession:
    def __init__(self, system_prompt: str):
        self.system_prompt = system_prompt
        self.conversation_history: List[Dict[str, str]] = [
            {"role": "system", "content": system_prompt}
        ]
        self.board_elements: List[WhiteboardElement] = []
        self.is_speaking: bool = False

    def add_user_message(self, text: str):
        self.conversation_history.append({"role": "user", "content": text})
        # Keep context window clean and fast (last 10 turns)
        if len(self.conversation_history) > 12:
            self.conversation_history = [self.conversation_history[0]] + self.conversation_history[-10:]

    def add_assistant_message(self, spoken_text: str):
        self.conversation_history.append({"role": "assistant", "content": spoken_text})

    def register_board_artifact(self, artifact_type: str, content: str):
        import time
        elem = WhiteboardElement(
            id=f"elem_{int(time.time() * 1000)}",
            element_type=artifact_type,
            content=content,
            timestamp=time.time()
        )
        self.board_elements.append(elem)

    def get_contextual_prompt_messages(self) -> List[Dict[str, str]]:
        """Injects current board state so Meta Llama knows what the student is looking at."""
        if not self.board_elements:
            return self.conversation_history

        active_board_summary = "\n".join(
            [f"- [{e.element_type.upper()}]: {e.content}" for e in self.board_elements[-4:]]
        )
        board_context_msg = {
            "role": "system",
            "content": f"[CURRENT BOARD STATE]:\n{active_board_summary}\nReference these active elements when the student asks about them."
        }
        return [self.conversation_history[0], board_context_msg] + self.conversation_history[1:]