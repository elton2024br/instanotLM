"""
Configurações centralizadas do pipeline Instagram → NotebookLM.
"""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Config:
    """Configuração principal do pipeline."""

    # === PERFIL ALVO ===
    username: str = ""

    # === DIRETÓRIOS ===
    base_dir: str = "data"
    images_subdir: str = "images"

    # === EXTRAÇÃO ===
    max_posts: int = 0  # 0 = todos os posts
    include_reels: bool = True
    include_igtv: bool = True

    # === ANTI-DETECÇÃO ===
    min_delay: float = 3.0  # segundos entre requests
    max_delay: float = 7.0  # delay aleatório max
    max_retries: int = 3
    retry_backoff_base: float = 2.0  # exponential backoff
    rate_limit_wait: int = 60  # espera em 429
    request_timeout: int = 30

    # Headers realistas
    user_agents: list = field(default_factory=lambda: [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
    ])

    # === PROXY (opcional) ===
    proxy_list: list = field(default_factory=list)  # ["http://ip:port", ...]
    proxy_rotation: bool = False

    # === AUTENTICAÇÃO (opcional) ===
    session_file: Optional[str] = None  # path para arquivo de sessão do instaloader
    instagram_user: Optional[str] = None
    instagram_pass: Optional[str] = None

    # === OCR ===
    ocr_engine: str = "easyocr"  # "easyocr" ou "tesseract"
    ocr_languages: list = field(default_factory=lambda: ["pt", "en"])
    tesseract_languages: str = "por+eng"  # formato do tesseract
    ocr_confidence_threshold: float = 0.3  # mínimo de confiança EasyOCR
    ocr_gpu: bool = False  # usar GPU para EasyOCR

    # === NOTEBOOKLM ===
    notebooklm_format: str = "markdown"  # "markdown" ou "text"
    max_doc_size_mb: float = 25.0  # limite NotebookLM ~25MB por source
    include_ocr_in_doc: bool = True
    include_captions_in_doc: bool = True
    include_comments_summary: bool = False
    chronological_order: bool = True  # mais antigo primeiro

    @property
    def output_dir(self) -> str:
        return os.path.join(self.base_dir, self.username)

    @property
    def images_dir(self) -> str:
        return os.path.join(self.output_dir, self.images_subdir)

    @property
    def posts_json(self) -> str:
        return os.path.join(self.output_dir, f"{self.username}_posts.json")

    @property
    def ocr_json(self) -> str:
        return os.path.join(self.output_dir, f"{self.username}_ocr.json")

    @property
    def full_data_json(self) -> str:
        return os.path.join(self.output_dir, f"{self.username}_full.json")

    @property
    def notebooklm_file(self) -> str:
        ext = "md" if self.notebooklm_format == "markdown" else "txt"
        return os.path.join(self.output_dir, f"{self.username}_notebooklm.{ext}")

    def ensure_dirs(self):
        """Cria diretórios de saída se não existirem."""
        os.makedirs(self.images_dir, exist_ok=True)
