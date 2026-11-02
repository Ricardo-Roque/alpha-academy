# Converte as imagens PNG pesadas de quiz-pt-br/assets/ para WebP (qualidade 80, com transparência).
# Depois rode `node _src/build.cjs`: o build troca .png por .webp em todo caminho que tiver a versão WebP.
# Uso (na raiz do repositório): python _src/optimize-images.py
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "quiz-pt-br", "assets")
MIN_BYTES = 8000   # ícones menores que isso já são leves em PNG
MAX_WIDTH = 686    # maior largura exibida (343px de tela x 2 para telas retina)
# tamanho máximo por arquivo, para imagens exibidas bem menores que o original
MAX_SIZE = {
    "offer/logo-alpha-crop.png": 128,  # exibido a 24px (cabeçalho) e 50px (loader)
}

saved = 0
for folder, _, names in os.walk(ROOT):
    for name in names:
        src = os.path.join(folder, name)
        rel = os.path.relpath(src, ROOT).replace("\\", "/")
        if not name.endswith(".png") or os.path.getsize(src) < MIN_BYTES:
            continue
        dst = src[:-4] + ".webp"
        im = Image.open(src)
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        limit = MAX_SIZE.get(rel, MAX_WIDTH)
        if im.width > limit:
            im = im.resize((limit, round(im.height * limit / im.width)), Image.LANCZOS)
        im.save(dst, "WEBP", quality=80, method=6)
        before, after = os.path.getsize(src), os.path.getsize(dst)
        saved += before - after
        print(f"{rel}: {before // 1024} KB -> {after // 1024} KB")
print(f"total economizado: {saved // 1024} KB", file=sys.stderr)
