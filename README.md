# 📸 InstaNotLM — Instagram Profile Extractor → NotebookLM

<p align="center">
  <img src="icons/icon128.png" alt="InstaNotLM Logo" width="96">
</p>

<p align="center">
  <strong>Extensão Chrome que extrai dados completos de perfis públicos do Instagram e gera documentos otimizados para análise com IA no Google NotebookLM.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white" alt="Chrome Extension">
  <img src="https://img.shields.io/badge/Manifest-V3-green" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Version-1.0.0-purple" alt="Version">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="License">
</p>

<p align="center">
	<img src="https://github.com/elton2024br/instanotLM/actions/workflows/python-package-conda.yml/badge.svg" alt="Build Status">
	<img src="https://img.shields.io/github/contributors/elton2024br/instanotLM" alt="Contributors">
	<img src="https://img.shields.io/github/discussions/elton2024br/instanotLM" alt="Discussions">
</p>

---

## 🎯 O que é?

O **InstaNotLM** é uma ferramenta de extração automatizada que coleta **todos os dados públicos** de um perfil do Instagram (posts, legendas, imagens, métricas) e gera um **documento Markdown consolidado** pronto para upload no [Google NotebookLM](https://notebooklm.google.com/), permitindo análise com IA de todo o conteúdo do perfil.

### Caso de uso principal
Documentação e investigação jornalística de perfis públicos institucionais:
- 🏛️ Prefeituras e órgãos públicos
- 🏢 Empresas públicas e estatais
- 👤 Políticos e figuras públicas
- 📰 Veículos de comunicação

---

## 📦 Como Instalar

### Passo a passo (2 minutos)

1. **Baixe o repositório**
   - Clique no botão verde **`Code`** → **`Download ZIP`**
   - Ou clone via terminal:
     ```bash
     git clone https://github.com/elton2024br/instanotLM.git
     ```

2. **Abra as extensões do Chrome**
   - Digite `chrome://extensions/` na barra de endereço e pressione Enter

3. **Ative o Modo Desenvolvedor**
   - No canto superior direito da página, ative o toggle **"Modo do desenvolvedor"**

4. **Carregue a extensão**
   - Clique no botão **"Carregar sem compactação"**
   - Navegue até a pasta do projeto (onde está o arquivo `manifest.json`)
   - Selecione a pasta e confirme

5. **Fixe a extensão** (opcional)
   - Clique no ícone de quebra-cabeça 🧩 na barra do Chrome
   - Clique no pin 📌 ao lado de "IG Profile Extractor" para fixar na barra

> ✅ Pronto! A extensão está instalada e pronta para usar.

---

## 🚀 Como Usar

### Extração completa em 4 cliques

#### 1️⃣ Navegue até o perfil
Acesse qualquer perfil **público** do Instagram no seu Chrome:
```
https://www.instagram.com/prefeituraubatuba
```

> ⚠️ **Importante:** Você precisa estar **logado no Instagram** no Chrome para a extração funcionar corretamente. A extensão usa a sessão autenticada do seu browser.

#### 2️⃣ Abra a extensão
Clique no ícone da extensão na barra do Chrome. O perfil será **detectado automaticamente** e você verá:
- Avatar, nome e username
- Número de posts e seguidores

#### 3️⃣ Configure (opcional)
Ajuste as opções de extração conforme sua necessidade:

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| **Limite de posts** | Quantos posts extrair (0 = todos) | 0 (todos) |
| **Incluir texto das imagens** | Captura descrições automáticas das imagens (accessibility captions) | Desativado |
| **Ordem cronológica** | Posts do mais antigo para o mais recente | Ativado |
| **Formato** | Markdown (.md) ou Texto (.txt) | Markdown |

> 💡 **Dica:** Para perfis com muitos posts (500+), comece com um limite menor (ex: 100) para testar. Depois repita com todos.

#### 4️⃣ Clique em "Extrair Perfil Completo"
A extração começa automaticamente com **progresso visual em tempo real**:

```
👤 Perfil → 📋 Posts → 📄 Documento → ✅ Download
```

Ao finalizar, **dois arquivos são baixados automaticamente** para sua pasta de Downloads:

| Arquivo | Descrição | Uso |
|---------|-----------|-----|
| `{username}_notebooklm.md` | 📄 Documento Markdown completo | Upload no NotebookLM |
| `{username}_full.json` | 💾 Dados brutos em JSON | Análise programática |

---

## 📓 Como usar no Google NotebookLM

Após a extração, siga estes passos para analisar o perfil com IA:

1. Acesse [**notebooklm.google.com**](https://notebooklm.google.com/)
2. Crie um **novo notebook**
3. Clique em **"Adicionar fonte"** → **"Fazer upload de arquivo"**
4. Selecione o arquivo `{username}_notebooklm.md` da sua pasta de Downloads
5. Aguarde o processamento (pode levar alguns segundos)
6. **Pronto!** Agora você pode fazer perguntas sobre o perfil

### 💬 Exemplos de perguntas para o NotebookLM

**Análise de conteúdo:**
- "Quais são os temas mais recorrentes nos posts desse perfil?"
- "Resuma a atividade do perfil nos últimos 6 meses"
- "Quais assuntos geraram mais engajamento?"

**Investigação jornalística:**
- "Liste todas as menções a licitações, contratos ou obras"
- "Identifique contradições entre posts diferentes"
- "Faça uma timeline dos eventos mencionados nas legendas"
- "Quais empresas ou pessoas são mencionadas com mais frequência?"

**Análise de engajamento:**
- "Quais hashtags têm mais correlação com alto engajamento?"
- "Em que dias/horários os posts performam melhor?"
- "Compare o engajamento entre posts com imagem e vídeo"

**Relatórios:**
- "Gere um relatório executivo sobre a comunicação deste perfil"
- "Crie uma análise SWOT da estratégia de conteúdo"
- "Liste os 10 posts mais relevantes para investigação"

---

## 📄 Estrutura do Documento Gerado

O Markdown gerado segue esta estrutura otimizada para análise por IA:

```markdown
# Perfil Instagram: @username
## Extração completa para análise no NotebookLM

- Data da extração: 2026-02-08 16:00:00
- Total de posts analisados: 523
- Posts com texto nas imagens: 187

## Informações do Perfil
- Nome, bio, seguidores, verificação, categoria...

## Estatísticas Agregadas
- Totais, médias, distribuição por tipo
- Top 5 posts mais curtidos
- Top 5 posts mais comentados

## Índice de Hashtags (Top 30)
- #hashtag (frequência)

## Localizações Mencionadas
- Local (frequência)

## Menções mais frequentes (Top 20)
- @perfil (frequência)

## Todos os Posts
### Post #1: SHORTCODE
- Data, tipo, URL, curtidas, comentários
- Localização, hashtags, menções
- Legenda completa
- Descrição automática da imagem

---

## Timeline: Posts por Mês
- YYYY-MM: quantidade, curtidas, comentários
```

---

## 🔧 Arquitetura Técnica

```
instanotLM/
├── manifest.json           # Manifest V3 do Chrome
├── icons/                  # Ícones (16/32/48/128px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── content.js          # Content Script — injeta no Instagram
│   │                       #   • Extrai perfil (API v1 + GraphQL + DOM)
│   │                       #   • Extrai posts com paginação automática
│   │                       #   • Download de imagens
│   │                       #   • Anti-detecção (delays, retry, rate limit)
│   ├── background.js       # Service Worker — orquestra o pipeline
│   │                       #   • Gerencia fluxo das 4 etapas
│   │                       #   • Gera documento Markdown para NotebookLM
│   │                       #   • Gerencia downloads automáticos
│   ├── popup.html          # Interface do usuário
│   ├── popup.css           # Estilos (tema dark, gradientes Instagram)
│   └── popup.js            # Lógica do popup (progresso, config, estado)
└── python-pipeline/        # Pipeline Python original (referência)
    ├── main.py             # Orquestrador CLI
    ├── config.py           # Configurações centralizadas
    ├── extractor.py        # Extração via Instaloader
    ├── downloader.py       # Download com rate limiting
    ├── ocr_processor.py    # OCR (EasyOCR + Tesseract)
    ├── notebooklm_prep.py  # Gerador de documento
    └── requirements.txt    # Dependências Python
```

### Pipeline de Extração (4 Etapas)

| Etapa | O que faz | Tecnologia |
|-------|-----------|------------|
| **1. Perfil** | Extrai nome, bio, seguidores, categoria, verificação | API v1 → LD+JSON → DOM |
| **2. Posts** | Coleta todos os posts com paginação automática | API v1 → GraphQL → DOM + Scroll |
| **3. OCR/Alt** | Captura descrições automáticas das imagens | Accessibility captions do Instagram |
| **4. Documento** | Gera Markdown otimizado com estatísticas e índices | Gerador interno |

### Sistema de 3 Fallbacks

A extensão tenta **3 métodos diferentes** para garantir máxima compatibilidade:

1. **API v1** (mais rápido e completo) → se falhar...
2. **API GraphQL** (query hashes) → se falhar...
3. **DOM Parsing** (scroll infinito + parsing HTML)

### Anti-detecção
- ⏱️ Delays aleatórios entre requisições (2-5s)
- 🔄 Retry automático com backoff exponencial
- 🚦 Tratamento de rate limit (HTTP 429) com espera de 60s
- 🍪 Usa sessão autenticada do browser (cookies)

---

## 🐍 Pipeline Python (Alternativa CLI)

O repositório inclui também o **pipeline Python original** na pasta `python-pipeline/`, que oferece funcionalidades mais avançadas:

### Instalação
```bash
cd python-pipeline
pip install -r requirements.txt
```

### Uso
```bash
# Extração completa
python main.py --username prefeituraubatuba

# Com limite de posts
python main.py --username prefeituraubatuba --max-posts 100

# Apenas gerar documento de dados existentes
python main.py --username prefeituraubatuba --only-notebooklm

# Com OCR usando Tesseract
python main.py --username prefeituraubatuba --ocr-engine tesseract

# Com sessão autenticada
python main.py --username prefeituraubatuba --session-file session-myuser
```

### Comparação: Extensão Chrome vs Pipeline Python

| Aspecto | 🌐 Extensão Chrome | 🐍 Pipeline Python |
|---------|--------------------|--------------------|
| Instalação | Sem dependências | Python + pip + libs |
| Autenticação | Sessão do browser | Session file / login |
| OCR | Accessibility captions | **EasyOCR + Tesseract** (mais preciso) |
| Anti-detecção | Delays aleatórios | **Proxies + User-Agent rotation** |
| Download de imagens | Opcional (para OCR) | **Download completo em alta resolução** |
| Output | Markdown + JSON | **Markdown + JSON + imagens locais** |
| Facilidade | ⭐ 1 clique | Linha de comando |
| Velocidade | ⭐ Mais rápido | Mais lento (downloads + OCR) |

---

## ⚠️ Limitações

- **Perfis privados** não são suportados (é necessário seguir o perfil)
- **Rate limiting** do Instagram pode limitar o número de posts extraídos por sessão
- **OCR da extensão** usa descrição automática do Instagram (menos preciso que EasyOCR do Python)
- **Carrosséis** podem ter imagens faltando se a API retornar dados incompletos
- **Sessão necessária**: é recomendado estar logado no Instagram para melhor acesso à API
- **Limite do NotebookLM**: ~500K palavras / 25MB por fonte (split automático se exceder)

---

## 🗺️ Roadmap

- [ ] Integrar Tesseract.js para OCR real no browser
- [ ] Exportar para PDF além de Markdown
- [ ] Suporte a extração de comentários
- [ ] Cache de extrações anteriores (evitar re-extração)
- [ ] Extração de Stories e Highlights (requer autenticação)
- [ ] Worker offscreen para processamento pesado
- [ ] Publicação na Chrome Web Store

---

## 📄 Licença

MIT License — Use livremente para fins jornalísticos e de investigação.

---

<p align="center">
  Feito para <strong>jornalismo investigativo</strong> 🔍📰
  <br>
  <a href="https://notebooklm.google.com/">📓 Google NotebookLM</a>
</p>
