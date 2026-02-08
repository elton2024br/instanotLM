# Instagram Profile Extractor → NotebookLM (Chrome Extension)

## Visao Geral

Extensao Chrome que extrai **todos os dados publicos** de um perfil do Instagram e gera um **documento Markdown otimizado para upload no Google NotebookLM**, permitindo analise com IA de todo o conteudo do perfil.

**Caso de uso:** Documentacao e investigacao jornalistica de perfis publicos institucionais (prefeituras, empresas publicas, politicos).

## Como Instalar

### Metodo 1: Carregar extensao descompactada (Desenvolvimento)

1. Abra `chrome://extensions/` no Chrome
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactacao**
4. Selecione a pasta da extensao (onde esta o `manifest.json`)
5. A extensao aparecera na barra de extensoes

### Metodo 2: Arquivo ZIP

1. Baixe o arquivo `ig-extractor-notebooklm-extension.zip`
2. Descompacte em uma pasta local
3. Siga os passos do Metodo 1

## Como Usar

1. **Navegue** ate um perfil publico do Instagram (ex: `instagram.com/prefeituraubatuba`)
2. **Clique** no icone da extensao na barra do Chrome
3. O perfil sera **detectado automaticamente** com preview de dados
4. **Configure** as opcoes:
   - Limite de posts (0 = todos)
   - Incluir texto das imagens (accessibility captions)
   - Ordem cronologica
   - Formato do documento (Markdown recomendado)
5. Clique em **Extrair Perfil Completo**
6. Aguarde a extracao (progresso visual em tempo real)
7. Os arquivos serao baixados automaticamente:
   - `{username}_notebooklm.md` - Documento para NotebookLM
   - `{username}_full.json` - Dados brutos em JSON
8. Faca upload do `.md` no [Google NotebookLM](https://notebooklm.google.com/)

## Arquitetura

```
ig-extractor-chrome-extension/
├── manifest.json          # Manifest V3 da extensao
├── icons/                 # Icones da extensao (16/32/48/128px)
├── src/
│   ├── content.js         # Content Script - injeta no Instagram
│   │                      # - Extrai dados do perfil (API v1 + GraphQL + DOM)
│   │                      # - Extrai posts com paginacao automatica
│   │                      # - Download de imagens e preprocessamento OCR
│   ├── background.js      # Service Worker - orquestra o pipeline
│   │                      # - Gerencia fluxo de extracao
│   │                      # - Gera documento Markdown para NotebookLM
│   │                      # - Gerencia downloads
│   ├── popup.html         # Interface do usuario
│   ├── popup.css          # Estilos (tema dark, gradientes Instagram)
│   └── popup.js           # Logica do popup (progresso, config, estado)
└── python-pipeline/       # Pipeline Python original (referencia)
    ├── main.py
    ├── config.py
    ├── extractor.py
    ├── downloader.py
    ├── ocr_processor.py
    ├── notebooklm_prep.py
    └── requirements.txt
```

## Pipeline de Extracao (4 Etapas)

### Etapa 1: Extracao do Perfil
- **API v1** (`/api/v1/users/web_profile_info/`) - mais confiavel
- **Fallback LD+JSON** (structured data da pagina)
- **Fallback DOM** (parsing direto dos elementos HTML)
- Dados: nome, bio, seguidores, posts, verificacao, categoria

### Etapa 2: Extracao de Posts
- **API v1** (`/api/v1/feed/user/`) com paginacao via `max_id`
- **Fallback GraphQL** (query hashes com `end_cursor`)
- **Fallback DOM** (scroll infinito + enriquecimento individual)
- Anti-deteccao: delays aleatorios, tratamento de rate limit (429)
- Dados por post: shortcode, data, legenda, hashtags, mencoes, curtidas, comentarios, URLs de imagens, localizacao

### Etapa 3: OCR/Accessibility
- Usa `accessibility_caption` nativa do Instagram (descricao automatica)
- Download e preprocessamento de imagens via Canvas API
- Sem dependencias externas pesadas (diferente do pipeline Python)

### Etapa 4: Geracao do Documento
- **Formato:** Markdown (.md) otimizado para NotebookLM
- **Secoes:** Perfil, Estatisticas, Top Posts, Hashtags, Localizacoes, Mencoes, Todos os Posts, Timeline
- **Split automatico** se documento > 25MB (limite NotebookLM)
- Mesma estrutura do `notebooklm_prep.py` original

## Documento Gerado (Exemplo)

```markdown
# Perfil Instagram: @prefeituraubatuba
## Extracao completa para analise no NotebookLM

- Data da extracao: 2026-02-08 16:00:00
- Total de posts analisados: 500
- Posts com texto nas imagens: 120
- Fonte: https://www.instagram.com/prefeituraubatuba/

## Informacoes do Perfil
- Nome completo: Prefeitura de Ubatuba
- Seguidores: 45.000
...

## Estatisticas Agregadas
- Total de curtidas: 250.000
- Media de curtidas/post: 500
...

## Todos os Posts
### Post #1: ABC123
- Data: 2025-01-15
- Curtidas: 1.200
- Legenda: [texto completo]
...
```

## Diferencas: Extensao Chrome vs Pipeline Python

| Aspecto | Extensao Chrome | Pipeline Python |
|---------|----------------|-----------------|
| Instalacao | Sem dependencias | Python + pip + libs |
| Autenticacao | Usa sessao do browser | Session file |
| API | API v1 + GraphQL + DOM | Instaloader (GraphQL) |
| OCR | Accessibility captions | EasyOCR + Tesseract |
| Anti-deteccao | Delay aleatorio | Proxies + User-Agent |
| Performance | Mais rapido (sem download massivo) | Mais completo (OCR real) |
| Output | Markdown + JSON | Markdown + JSON + imagens |

## Limitacoes

- **Perfis privados** nao sao suportados (exigem seguir o perfil)
- **Rate limiting** do Instagram pode limitar o numero de posts extraidos por sessao
- **OCR** usa descricao automatica do Instagram (menos preciso que EasyOCR)
- **Carrosseis** podem ter imagens faltando se a API retornar dados incompletos
- Recomendado usar com **conta logada** no Instagram para melhor acesso a API

## Proximos Passos (Roadmap)

- [ ] Integrar Tesseract.js para OCR real no browser
- [ ] Exportar para PDF alem de Markdown
- [ ] Suporte a extracao de comentarios
- [ ] Cache de extracoes anteriores
- [ ] Extracao de Stories/Highlights (requer autenticacao)
- [ ] Worker offscreen para processamento pesado
