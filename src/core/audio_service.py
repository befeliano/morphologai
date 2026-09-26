from PyQt6.QtCore import QThread, pyqtSignal
import speech_recognition as sr

class AudioRecorder(QThread):
    finished_signal = pyqtSignal(str)
    error_signal = pyqtSignal(str)
    status_signal = pyqtSignal(str)

    def __init__(self):
        super().__init__()
        self.is_recording = True
        self.recognizer = sr.Recognizer()
        self.recognizer.energy_threshold = 3000
        self.recognizer.dynamic_energy_threshold = True
        self.recognizer.pause_threshold = 1.2

    def stop_recording(self): self.is_recording = False

    def run(self):
        try:
            with sr.Microphone() as source:
                self.status_signal.emit("🎤 Kayıt Başladı...")
                self.recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio_data_list = []
                while self.is_recording:
                    try:
                        chunk = self.recognizer.listen(source, timeout=1, phrase_time_limit=10)
                        audio_data_list.append(chunk)
                    except sr.WaitTimeoutError: continue 
                
                self.status_signal.emit("🛑 İşleniyor...")
                try:
                    last_chunk = self.recognizer.listen(source, timeout=2, phrase_time_limit=5)
                    audio_data_list.append(last_chunk)
                except sr.WaitTimeoutError: pass

                text = self.recognizer.recognize_google(audio_data_list[0] if len(audio_data_list)==1 else sr.AudioData(b"".join([c.get_raw_data() for c in audio_data_list]), source.SAMPLE_RATE, source.SAMPLE_WIDTH), language='tr-TR')
                self.finished_signal.emit(text)
        except Exception as e: self.error_signal.emit(f"Hata: {str(e)}")