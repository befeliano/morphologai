from PyQt6.QtCore import QThread, pyqtSignal
import stanza
import zeyrek

class ModelLoader(QThread):
    finished_signal = pyqtSignal(object, object)
    status_signal = pyqtSignal(str)

    def run(self):
        try:
            self.status_signal.emit("🧠 Stanza Yükleniyor...")
            stanza.download('tr', verbose=False) 
            nlp_stanza = stanza.Pipeline('tr', processors='tokenize,mwt,pos,lemma', verbose=False, use_gpu=False)
            self.status_signal.emit("👀 Zeyrek Hazırlanıyor...")
            analyzer_zeyrek = zeyrek.MorphAnalyzer()
            self.finished_signal.emit(nlp_stanza, analyzer_zeyrek)
        except Exception as e:
            self.status_signal.emit(f"Hata: {str(e)}")