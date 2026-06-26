import io
from rembg import remove, new_session
from PIL import Image
import numpy as np

# Create a dummy image
img = Image.new('RGB', (100, 100), color = 'red')
img_byte_arr = io.BytesIO()
img.save(img_byte_arr, format='PNG')
data = img_byte_arr.getvalue()

session = new_session("isnet-general-use")
out = remove(data, session=session, only_mask=True)
out_img = Image.open(io.BytesIO(out))

arr = np.array(out_img)
print("Shape:", arr.shape)
print("Mode:", out_img.mode)
