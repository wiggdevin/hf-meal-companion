"""Create authored label panels and local synthetic speech; never reads account media."""
from pathlib import Path
import json
import shutil
import subprocess
import hashlib
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent / 'public-capture'
ROOT.mkdir(exist_ok=True)
FONT = '/System/Library/Fonts/Helvetica.ttc'

def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size=size)

labels = [
    ('label-40g', 40, {'Calories': 120, 'Total Fat': '4 g', 'Total Carbohydrate': '16 g', 'Protein': '5 g'},
     {'energy_kcal': 300, 'fat_total': 10, 'carbohydrate': 40, 'protein': 12.5}, 'oats, water'),
    ('label-50g', 50, {'Calories': 100, 'Total Fat': '0 g', 'Total Carbohydrate': '20 g', 'Protein': '5 g'},
     {'energy_kcal': 200, 'fat_total': 0, 'carbohydrate': 40, 'protein': 10}, 'rice, apple'),
]
media = []
for ident, grams, printed, expected, ingredients in labels:
    image = Image.new('RGB', (850, 1100), 'white')
    draw = ImageDraw.Draw(image)
    draw.rectangle((35, 35, 815, 1065), outline='black', width=4)
    product_name = 'Synthetic Oat Squares' if ident == 'label-40g' else 'Synthetic Rice Apple Mix'
    draw.text((60, 55), product_name + ' (TEST)', font=font(27), fill='black')
    draw.text((60, 115), 'Nutrition Facts', font=font(70), fill='black')
    draw.text((60, 215), f'Serving size {grams} g', font=font(38), fill='black')
    draw.line((60, 285, 790, 285), fill='black', width=15)
    for n, (nutrient_name, value) in enumerate(printed.items()):
        y = 325 + n * 105
        draw.text((60, y), f'{nutrient_name}  {value}', font=font(40), fill='black')
        draw.line((60, y + 75, 790, y + 75), fill='black', width=2)
    draw.text((60, 880), 'Ingredients:', font=font(30), fill='black')
    draw.text((60, 930), ingredients, font=font(30), fill='black')
    path = ROOT / f'{ident}.png'
    image.save(path)
    media.append({'id': ident, 'name': product_name, 'servingGrams': grams, 'printed': printed,
                  'per100g': expected, 'ingredientsText': ingredients,
                  'omittedNutrients': 'unknown, never zero'})
(ROOT / 'label-gold.json').write_text(json.dumps(media, indent=2) + '\n')

# Regeneration must not leave hashes describing a different set of authored assets.
manifest_path = ROOT / 'manifest.json'
if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text())
    for asset in manifest['authoredAssets']:
        asset['sha256'] = hashlib.sha256((ROOT / Path(asset['path']).name).read_bytes()).hexdigest()
    manifest['corpusSha256'] = hashlib.sha256((ROOT / 'cases.jsonl').read_bytes()).hexdigest()
    manifest['labelGoldSha256'] = hashlib.sha256((ROOT / 'label-gold.json').read_bytes()).hexdigest()
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')

# Speech is generated locally and ignored by Git; no private person's recording is needed.
voice_root = ROOT / 'generated'
voice_root.mkdir(exist_ok=True)
if shutil.which('say'):
    for ident, text in [('voice-grams', 'I ate 150 grams of cooked chicken breast.'),
                        ('voice-salmon', 'I ate 100 grams of salmon.')]:
        subprocess.run(['say', '--file-format=WAVE', '--data-format=LEI16@16000',
                        '-o', str(voice_root / f'{ident}.wav'), text], check=True)
    print('Generated two synthetic labels and two local speech fixtures.')
else:
    print('Generated labels. Speech not generated: macOS say is unavailable.')
