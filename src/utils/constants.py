POS_MAP = {
    'NOUN': 'İsim', 'VERB': 'Fiil', 'ADJ': 'Sıfat', 'ADV': 'Zarf',
    'PRON': 'Zamir', 'NUM': 'Sayı', 'DET': 'Belirteç', 'CCONJ': 'Bağlaç',
    'SCONJ': 'Bağlaç', 'INTJ': 'Ünlem', 'PUNCT': 'Noktalama',
    'PROPN': 'Özel İsim', 'AUX': 'Yardımcı Fiil', 'X': 'Bilinmiyor', 
    'FILLER': 'Dolgu Kelimesi', 'EDAT': 'Edat'
}

VIP_DUZELTMELER = {
    "bana": ("ben/a", "Zamir"), 
    "sana": ("san/a", "Zamir"), 
    "ona":  ("o/n/a", "Zamir"), 
    "şey":  ("şey", "Dolgu Kelimesi"),
    "lütfen": ("lütfen", "Zarf"),
    "sürü": ("sürü", "İsim"),
    
    # Edatlar
    "mi": ("mi", "Edat"), "mı": ("mı", "Edat"), "mu": ("mu", "Edat"), "mü": ("mü", "Edat"),
    "miyim": ("mi", "Edat"), "mıyım": ("mı", "Edat"), "muyum": ("mu", "Edat"), "müyüm": ("mü", "Edat"),
    "misin": ("mi", "Edat"), "mısın": ("mı", "Edat"), "musun": ("mu", "Edat"), "müsün": ("mü", "Edat"),
    "miyiz": ("mi", "Edat"), "mıyız": ("mı", "Edat"), "muyuz": ("mu", "Edat"), "müyüz": ("mü", "Edat"),
    "misiniz": ("mi", "Edat"), "mısınız": ("mı", "Edat"), "musunuz": ("mu", "Edat"), "müsünüz": ("mü", "Edat"),
    "miydi": ("mi", "Edat"), "mıydı": ("mı", "Edat"), "muydu": ("mu", "Edat"), "müydü": ("mü", "Edat"),
    "miydin": ("mi", "Edat"), "mıydın": ("mı", "Edat"), "muydun": ("mu", "Edat"), "müydün": ("mü", "Edat"),
    "miydik": ("mi", "Edat"), "mıydık": ("mı", "Edat"), "muyduk": ("mu", "Edat"), "müydük": ("mü", "Edat"),
    "miydiniz": ("mi", "Edat"), "mıydınız": ("mı", "Edat"), "muydunuz": ("mu", "Edat"), "müydünüz": ("mü", "Edat")
}