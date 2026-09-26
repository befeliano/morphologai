import os
import sys
from datetime import datetime
from collections import Counter
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QPushButton, 
                             QLabel, QTextEdit, QMessageBox, QLineEdit, QHBoxLayout, QFileDialog)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont, QPalette, QColor

# Modüllerden importlar
from src.utils.constants import POS_MAP, VIP_DUZELTMELER
from src.core.thread_workers import ModelLoader
from src.core.audio_service import AudioRecorder

class AppWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.stanza_model = None
        self.zeyrek_model = None
        self.is_dark_mode = True
        self.last_stats = None
        self.init_ui()
        
        self.loader = ModelLoader()
        self.loader.status_signal.connect(self.update_status)
        self.loader.finished_signal.connect(self.on_models_loaded)
        self.loader.start()

    def init_ui(self):
        self.setWindowTitle("MorphologAI")
        self.setGeometry(100, 100, 1000, 850)
        
        main_layout = QVBoxLayout()
        
        top_bar = QHBoxLayout()
        self.label_title = QLabel("MorphologAI Dil Analizi & Rapor")
        self.label_title.setStyleSheet("font-size: 24px; font-weight: bold;")
        
        self.btn_theme = QPushButton("☀️ Aydınlık Mod")
        self.btn_theme.setFixedWidth(120)
        self.btn_theme.clicked.connect(self.toggle_theme)

        self.btn_save = QPushButton("💾 Analiz Raporunu Kaydet (.txt)")
        self.btn_save.setEnabled(False) 
        self.btn_save.setStyleSheet("""
            QPushButton { 
                background-color: #f39c12; color: white; padding: 12px; 
                font-size: 16px; border-radius: 8px; font-weight: bold; margin-top: 10px;
            }
        """)
        self.btn_save.clicked.connect(self.save_report_to_file)
        
        top_bar.addWidget(self.label_title)
        top_bar.addStretch()
        top_bar.addWidget(self.btn_theme)
        main_layout.addLayout(top_bar)

        self.label_status = QLabel("Sistem Başlatılıyor...")
        self.label_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.label_status)

        self.btn_record = QPushButton("⏳ YÜKLENİYOR...")
        self.btn_record.setEnabled(False)
        self.btn_record.setCheckable(True)
        self.btn_record.clicked.connect(self.toggle_recording)
        main_layout.addWidget(self.btn_record)

        main_layout.addWidget(self.btn_save)

        input_layout = QHBoxLayout()
        self.input_box = QLineEdit()
        self.input_box.setPlaceholderText("Metni buraya yazın...")
        self.input_box.returnPressed.connect(self.process_manual_input)
        input_layout.addWidget(self.input_box)

        self.btn_analyze = QPushButton("Analiz Et")
        self.btn_analyze.clicked.connect(self.process_manual_input)
        input_layout.addWidget(self.btn_analyze)
        main_layout.addLayout(input_layout)

        content_layout = QHBoxLayout()
        self.text_output = QTextEdit()
        self.text_output.setReadOnly(True)
        self.text_output.setFont(QFont("Consolas", 11))
        content_layout.addWidget(self.text_output, 1)

        self.figure = Figure(figsize=(5, 5), dpi=100)
        self.canvas = FigureCanvas(self.figure)
        content_layout.addWidget(self.canvas, 1)

        main_layout.addLayout(content_layout)
        self.setLayout(main_layout)
        self.apply_theme()

    def toggle_theme(self):
        self.is_dark_mode = not self.is_dark_mode
        self.btn_theme.setText("☀️ Aydınlık Mod" if self.is_dark_mode else "🌙 Koyu Mod")
        self.apply_theme()
        if self.last_stats: self.update_chart(self.last_stats)

    def save_report_to_file(self):
        report_content = self.text_output.toPlainText()
        
        if not report_content or "📊  İSTATİSTİK" not in report_content:
            QMessageBox.warning(self, "Hata", "Önce bir analiz yapmalısın!")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self, 
            "Analiz Raporunu Kaydet", 
            os.path.expanduser("~/Desktop/Dil_Analiz_Raporu.txt"),
            "Metin Dosyası (*.txt)"
        )
        su_an = datetime.now().strftime("%d.%m.%Y %H:%M")
        if file_path:
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write("==========================================\n")
                    f.write("       MorphologAI DİL ANALİZ RAPORU          \n")
                    f.write(f"       Tarih: {su_an} \n")
                    f.write("==========================================\n\n")
                    f.write(report_content)
                    f.write("\n\n-- Analiz MorphologAI Tarafından Oluşturuldu --")
                
                QMessageBox.information(self, "Başarılı", "Rapor tüm istatistiklerle birlikte kaydedildi!")
            except Exception as e:
                QMessageBox.critical(self, "Hata", f"Kaydedilemedi: {str(e)}")

    def apply_theme(self):
        palette = QPalette()
        if self.is_dark_mode:
            bg, fg, widget_bg = QColor(45, 45, 45), QColor(220, 220, 220), QColor(30, 30, 30)
            self.btn_record_style = "background-color: #32CD32; color: white;"
            self.input_style = "background-color: #333; color: #eee; border: 1px solid #555;"
        else:
            bg, fg, widget_bg = QColor(245, 245, 245), QColor(30, 30, 30), QColor(255, 255, 255)
            self.btn_record_style = "background-color: #2ecc71; color: white;"
            self.input_style = "background-color: white; color: black; border: 1px solid #ccc;"

        palette.setColor(QPalette.ColorRole.Window, bg)
        palette.setColor(QPalette.ColorRole.WindowText, fg)
        palette.setColor(QPalette.ColorRole.Base, widget_bg)
        palette.setColor(QPalette.ColorRole.Text, fg)
        palette.setColor(QPalette.ColorRole.Button, bg)
        palette.setColor(QPalette.ColorRole.ButtonText, fg)
        self.setPalette(palette)
        
        self.text_output.setStyleSheet(f"background-color: {widget_bg.name()}; color: {fg.name()}; border: 1px solid #888;")
        self.input_box.setStyleSheet(self.input_style)
        self.btn_theme.setStyleSheet("padding: 5px; font-weight: bold;")
        self.canvas.setStyleSheet(f"background-color: {bg.name()};")

    def on_models_loaded(self, s, z):
        self.stanza_model, self.zeyrek_model = s, z
        self.label_status.setText("Sistem Hazır!")
        self.btn_record.setEnabled(True)
        self.btn_record.setText("🎙️ KAYDI BAŞLAT")
        self.btn_record.setStyleSheet(self.btn_record_style + "padding: 15px; font-size: 18px; border-radius: 8px; font-weight: bold;")

    def perform_analysis(self, text):
        if not text: return
        
        doc = self.stanza_model(text)
        results = [f"🗣️ Metin: {text}", "-"*40]
        stats = Counter()
        valid_word_count = 0 
        
        for sentence in doc.sentences:
            for word in sentence.words:
                orig = word.text
                if orig.lower() in VIP_DUZELTMELER: 
                    vis, tp = VIP_DUZELTMELER[orig.lower()]
                else:
                    tp = POS_MAP.get(word.upos, 'Diğer')
                    parses = self.zeyrek_model.analyze(orig.lower())
                    vis = "/".join([p.split(':')[0] for p in parses[0][0].formatted.split('+') if ':' in p]) if parses else orig
                
                if tp != 'Noktalama':
                    stats[tp] += 1
                    valid_word_count += 1
                    results.append(f"✅ {orig} -> [{vis} ({tp})]")

        results.append("\n📊  İSTATİSTİK")
        results.append("-" * 40)
        
        for pos_type, count in stats.most_common():
            pct = (count / valid_word_count) * 100 if valid_word_count > 0 else 0
            results.append(f"• {count} adet {pos_type} (%{pct:.1f})")

        self.btn_save.setEnabled(True)
        self.btn_save.setStyleSheet("""
            QPushButton { 
                background-color: #f39c12; color: white; padding: 12px; 
                font-size: 16px; border-radius: 8px; font-weight: bold; 
            }
        """)

        self.last_stats = stats
        self.text_output.setText("\n".join(results))
        self.update_chart(stats)

    def update_chart(self, stats):
        self.figure.clear()
        ax = self.figure.add_subplot(111)
        labels, values = list(stats.keys()), list(stats.values())
        colors = plt.cm.Pastel1(range(len(labels))) if not self.is_dark_mode else plt.cm.Set3(range(len(labels)))
        
        txt_color = 'white' if self.is_dark_mode else 'black'
        wedges, texts, autotexts = ax.pie(values, labels=labels, autopct='%1.1f%%', colors=colors, startangle=140)
        plt.setp(texts, color=txt_color, weight="bold")
        plt.setp(autotexts, color=txt_color if not self.is_dark_mode else 'black', size=9)
        
        ax.set_title("Kelime Dağılımı", color=txt_color, fontweight='bold')
        self.figure.patch.set_facecolor('none')
        self.canvas.draw()

    def process_manual_input(self): self.perform_analysis(self.input_box.text())
    def process_audio_text(self, t): self.perform_analysis(t); self.reset_btn()
    def toggle_recording(self):
        if self.btn_record.isChecked():
            self.btn_record.setText("⏹️ KAYDI BİTİR"); self.text_output.clear()
            self.recorder = AudioRecorder()
            self.recorder.finished_signal.connect(self.process_audio_text)
            self.recorder.start()
        else: self.btn_record.setText("⏳ BEKLEYİN..."); self.recorder.stop_recording()
    def update_status(self, m): self.label_status.setText(m)
    def reset_btn(self): self.btn_record.setChecked(False); self.btn_record.setText("🎙️ KAYDI BAŞLAT"); self.btn_record.setEnabled(True)