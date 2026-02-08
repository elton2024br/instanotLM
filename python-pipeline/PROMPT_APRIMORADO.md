# PROMPT APRIMORADO: Instagram Profile Extractor → NotebookLM

## Contexto & Objetivo

Sou jornalista investigativo e desenvolvedor Python. Preciso de uma **ferramenta de extração automatizada** que colete TODOS os dados públicos de um perfil do Instagram (posts, legendas, imagens, métricas) e gere um **documento consolidado otimizado para upload no Google NotebookLM**, permitindo análise com IA de todo o conteúdo do perfil.

**Caso de uso:** Documentação e investigação jornalística de perfis públicos institucionais (prefeituras, empresas públicas, políticos).

---

## Arquitetura do Pipeline (4 Etapas)

### ETAPA 1: Extração de Metadados do Perfil e Posts

**Tecnologia:** `instaloader` (biblioteca mais robusta e mantida para Instagram)

**Input:** Username do perfil (ex: `prefeituraubatuba`)

**Dados a extrair do perfil:**
- Nome, biografia, URL externa, seguidores, seguindo, total de posts
- Status: verificado, business, categoria
- Foto de perfil URL

**Dados a extrair de CADA post:**
- Shortcode, URL completa, tipo (imagem/vídeo/carrossel)
- Data UTC e local
- Legenda completa com hashtags e menções extraídas
- Curtidas, comentários (contagem)
- URLs de todas as imagens (incluindo carrosséis com `get_sidecar_nodes()`)
- Localização (nome, lat, lng)
- Accessibility caption (descrição automática do Instagram)
- Contagem de views para vídeos

**Output:** JSON estruturado com todos os dados

**Paginação:** Automática via `profile.get_posts()` do instaloader (GraphQL API)

---

### ETAPA 2: Download de Imagens em Alta Resolução

**Tecnologia:** `httpx` (HTTP/2, async-ready, melhor que requests)

**Regras de download:**
- Nomenclatura: `{username}_{shortcode}.jpg` (post único) ou `{username}_{shortcode}_{N}.jpg` (carrossel)
- Validação: verificar que o arquivo baixado é imagem válida com `Pillow`
- Skip: pular se arquivo já existe (retomada de downloads interrompidos)

**Anti-detecção obrigatória:**
- 5+ User-Agents realistas (Chrome, Firefox, Safari) com rotação aleatória
- Headers completos: Accept, Accept-Language, Referer, DNT, Sec-Fetch-*
- Delay aleatório: `random.uniform(3.0, 7.0)` segundos entre requests
- Retry: 3 tentativas com exponential backoff (base=2s)
- HTTP 429: esperar 60s antes de retry
- HTTP 404/410: registrar post excluído, continuar
- Suporte a proxy list (arquivo texto, rotação round-robin)
- Suporte a sessão autenticada (session file do instaloader)

---

### ETAPA 3: OCR nas Imagens

**Tecnologia primária:** `easyocr` (deep learning, melhor para textos sobre fotos)
**Fallback:** `pytesseract` (mais rápido, requer binário separado)

**Pré-processamento (Pillow):**
- Converter para RGB
- Redimensionar se > 2000px (OCR não precisa de resolução extrema)
- Aumentar contraste (+30%) e nitidez (+50%)

**Configuração OCR:**
- Idiomas: português + inglês (`["pt", "en"]`)
- Confiança mínima: 0.3 (EasyOCR)
- Mode paragraph=True para agrupar texto
- GPU opcional via flag

**Fallback automático:** Se engine primária retornar vazio, tentar a outra

**Output:** JSON mapeando `shortcode → texto_extraído`

---

### ETAPA 4: Geração do Documento para NotebookLM ⭐ (DIFERENCIAL)

**Este é o objetivo final do pipeline.** O NotebookLM aceita fontes de até ~500K palavras / 25MB.

**Formato:** Markdown (.md) — o LLM do NotebookLM extrai melhor significado semântico com headers e estrutura

**Estrutura do documento gerado:**

```markdown
# Perfil Instagram: @username
## Extração completa para análise

- Data da extração: ...
- Total de posts analisados: ...
- Posts com texto OCR: ...

## Informações do Perfil
(todos os metadados)

## Estatísticas Agregadas
(totais, médias, top 5 posts)

## Índice de Hashtags (Top 30)
(frequência de cada hashtag)

## Localizações Mencionadas
(lista com frequência)

## Todos os Posts
### Post #1: SHORTCODE
- Data: ...
- Tipo: 📷 Imagem / 🎬 Vídeo / 📑 Carrossel
- Curtidas: ... | Comentários: ...
- Hashtags: ...
- Menções: ...

**Legenda:**
> texto completo da legenda

**Texto extraído da imagem (OCR):**
```
texto do OCR
```

---

## Timeline: Posts por Mês
(contagem e engajamento por mês)
```

**Split automático:** Se documento > 25MB, dividir em partes de ~100 posts cada

---

## Estrutura de Saída Final

```
data/{username}/
├── {username}_posts.json       # Metadados brutos (Etapa 1)
├── {username}_ocr.json         # Resultados OCR separados (Etapa 3)
├── {username}_full.json        # Dados completos consolidados
├── {username}_notebooklm.md   # 📄 DOCUMENTO PRINCIPAL → upload no NotebookLM
├── {username}_notebooklm_part1.md  # (se precisou dividir)
├── {username}_notebooklm_part2.md
└── images/
    ├── {username}_{shortcode1}.jpg
    ├── {username}_{shortcode2}_1.jpg  (carrossel)
    ├── {username}_{shortcode2}_2.jpg
    └── ...
```

---

## CLI (Interface de Linha de Comando)

```bash
# Pipeline completo
python main.py --username prefeituraubatuba

# Com limite de posts
python main.py --username prefeituraubatuba --max-posts 100

# Com sessão autenticada
python main.py --username prefeituraubatuba --session-file session-myuser

# Com proxies
python main.py --username prefeituraubatuba --proxy-list proxies.txt

# Apenas gerar documento NotebookLM de dados já extraídos
python main.py --username prefeituraubatuba --only-notebooklm

# Pular etapas específicas
python main.py --username prefeituraubatuba --skip-download --skip-ocr

# Usar Tesseract ao invés de EasyOCR
python main.py --username prefeituraubatuba --ocr-engine tesseract

# EasyOCR com GPU
python main.py --username prefeituraubatuba --ocr-gpu
```

---

## Stack Técnica

| Componente | Biblioteca | Justificativa |
|------------|-----------|---------------|
| Extração | `instaloader` | Mais robusta, lida com paginação GraphQL, sessões |
| HTTP | `httpx` | HTTP/2, async-ready, melhor controle de proxies |
| Imagem | `Pillow` | Pré-processamento, validação, redimensionamento |
| OCR (primary) | `easyocr` | Deep learning, melhor para texto sobre fotos |
| OCR (fallback) | `pytesseract` | Mais rápido, funcional offline |
| Config | `dataclass` | Type-safe, valores padrão, sem dependência |
| CLI | `argparse` | Stdlib, flexível, bom para scripts |

---

## Requisitos Não-Funcionais

1. **Resiliência:** Pipeline deve salvar progresso a cada etapa (JSON intermediário). Se interrompido, retomar de onde parou.
2. **Logging:** Logs coloridos no terminal + arquivo `pipeline.log` com timestamps.
3. **Modularidade:** Cada etapa é uma classe independente, pode ser usada separadamente.
4. **Segurança:** Nunca hardcodar credenciais. Suportar session files e variáveis de ambiente.
5. **Performance:** Download e OCR são as etapas mais lentas. Delays são intencionais para anti-detecção.
