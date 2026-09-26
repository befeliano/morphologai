"""
MorphologAI Backend API

Çalıştırma:
    pip install -r requirements.txt
    python -c "import stanza; stanza.download('tr')"   # bir kez
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("morphologai")

# Zeyrek'in spam WARNING loglarını sustur (her kelime için "APPENDING RESULT" yazıyor)
logging.getLogger("zeyrek.rulebasedanalyzer").setLevel(logging.ERROR)
logging.getLogger("zeyrek").setLevel(logging.ERROR)

# --- FastAPI ---
app = FastAPI(title="MorphologAI Backend API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# --- Lazy Loaded Models ---
_stanza_nlp = None
_zeyrek_analyzer = None


def get_stanza():
    global _stanza_nlp
    if _stanza_nlp is None:
        import stanza
        log.info("Stanza Türkçe modeli yükleniyor...")
        _stanza_nlp = stanza.Pipeline(
            'tr',
            processors='tokenize,pos,lemma',
            verbose=False,
        )
        log.info("Stanza hazır.")
    return _stanza_nlp


def get_zeyrek():
    global _zeyrek_analyzer
    if _zeyrek_analyzer is None:
        import zeyrek
        log.info("Zeyrek analizörü yükleniyor...")
        _zeyrek_analyzer = zeyrek.MorphAnalyzer()
        log.info("Zeyrek hazır.")
    return _zeyrek_analyzer


POS_MAP = {
    "NOUN":  ("İsim",       "noun"),
    "PROPN": ("İsim",       "noun"),
    "VERB":  ("Fiil",       "verb"),
    "AUX":   ("Fiil",       "verb"),
    "PRON":  ("Zamir",      "pron"),
    "CCONJ": ("Bağlaç",     "conj"),
    "SCONJ": ("Bağlaç",     "conj"),
    "ADV":   ("Zarf/Sıfat", "adv"),
    "ADJ":   ("Zarf/Sıfat", "adv"),
    "NUM":   ("Diğer",      "other"),
    "DET":   ("Diğer",      "other"),
    "ADP":   ("Diğer",      "other"),
    "PART":  ("Diğer",      "other"),
    "INTJ":  ("Diğer",      "other"),
    "PUNCT": ("Diğer",      "other"),
    "SYM":   ("Diğer",      "other"),
    "X":     ("Diğer",      "other"),
}


class AnalyzeRequest(BaseModel):
    text: str


@app.get("/")
def health():
    return {"status": "ok", "service": "MorphologAI Backend"}


@app.post("/api/morphology")
def analyze_text(req: AnalyzeRequest) -> Dict[str, Any]:
    text = (req.text or "").strip()
    if not text:
        return {"words": [], "stats": {}, "totalWords": 0}

    try:
        stanza_nlp = get_stanza()
        zeyrek_an = get_zeyrek()
    except Exception as e:
        log.exception("Model yükleme hatası")
        raise HTTPException(status_code=500, detail=f"Model yüklenemedi: {e}")

    try:
        doc = stanza_nlp(text)
    except Exception as e:
        log.exception("Stanza analiz hatası")
        raise HTTPException(status_code=500, detail=f"Stanza hatası: {e}")

    words_data: List[Dict[str, Any]] = []
    stats: Dict[str, int] = {
        "İsim": 0, "Fiil": 0, "Zamir": 0,
        "Bağlaç": 0, "Zarf/Sıfat": 0, "Diğer": 0,
    }

    for sentence in doc.sentences:
        for word in sentence.words:
            orig = word.text
            upos = word.upos or "X"
            lemma = word.lemma or orig

            if upos == "PUNCT":
                continue

            pos_tr, css_class = POS_MAP.get(upos, ("Diğer", "other"))

            morphemes: List[str] = []
            if upos in ("VERB", "NOUN", "PROPN", "ADJ", "ADV"):
                try:
                    zresults = zeyrek_an.analyze(orig)
                    if zresults and len(zresults) > 0 and len(zresults[0]) > 0:
                        parse = zresults[0][0]
                        ms = getattr(parse, "morphemes", None) or []
                        for m in ms:
                            if isinstance(m, tuple) and len(m) >= 1:
                                surface = m[0]
                            else:
                                surface = getattr(m, "surface", None) or str(m)
                            if surface:
                                morphemes.append(surface)
                except Exception:
                    pass

            stats[pos_tr] = stats.get(pos_tr, 0) + 1

            words_data.append({
                "original": orig,
                "root": lemma,
                "pos": pos_tr,
                "css": css_class,
                "morphemes": morphemes if morphemes else None,
            })

    stats = {k: v for k, v in stats.items() if v > 0}

    return {
        "words": words_data,
        "stats": stats,
        "totalWords": len(words_data),
    }