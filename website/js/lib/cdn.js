/**
 * Harici kütüphaneleri yalnızca gerektiğinde yükler.
 * Sürümler sabitlenmiştir ve klasik betikler alt kaynak bütünlüğü (SRI) ile doğrulanır:
 * CDN'deki dosya değiştirilirse tarayıcı betiği çalıştırmaz.
 * Kütüphane sürümü değiştirilirse karma değeri de güncellenmelidir.
 */
const loaded = new Map();

export const LIBS = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
  pdfmake: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/pdfmake.min.js',
  pdfFonts: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.23/build/vfs_fonts.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  // ES modülü olarak içe aktarılır (yalnızca bulut modunda); sürüm sabit
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm',
};

const SRI = {
  [LIBS.chart]: 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ',
  [LIBS.pdfmake]: 'sha384-8Fgcdr1c4x0qG8ByTWhXwvf1iBa6tQReFeLNBSkvCN9F+/RZuP1ha8RUydfLSGeG',
  [LIBS.pdfFonts]: 'sha384-ZiMMZvHUP692kyJimOQHoH2VdTrbcEwHaQfitnsxsR8tY0ntoRbPxIA6p+9yNNbz',
  [LIBS.jszip]: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
};

export function loadScript(url) {
  if (loaded.has(url)) return loaded.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    if (SRI[url]) s.integrity = SRI[url];
    s.referrerPolicy = 'no-referrer';
    s.onload = () => resolve();
    s.onerror = () => { loaded.delete(url); s.remove(); reject(new Error(`Kütüphane yüklenemedi: ${url.split('/').slice(-1)[0]} (internet bağlantısını kontrol edin)`)); };
    document.head.appendChild(s);
  });
  loaded.set(url, p);
  return p;
}

export async function loadChart() {
  if (!window.Chart) await loadScript(LIBS.chart);
  return window.Chart;
}

export async function loadPdfMake() {
  if (!window.pdfMake) await loadScript(LIBS.pdfmake);
  if (!window.pdfMake.vfs || !Object.keys(window.pdfMake.vfs).length) await loadScript(LIBS.pdfFonts);
  return window.pdfMake;
}

export async function loadJSZip() {
  if (!window.JSZip) await loadScript(LIBS.jszip);
  return window.JSZip;
}
