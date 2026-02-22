from PIL import Image
import numpy as np

img = Image.open("input_file_0.png").convert("RGB")
data = np.array(img)
avg_color = np.mean(data, axis=(0, 1))
print(f"Average Color RGB: {avg_color}")
hex_color = '#{:02x}{:02x}{:02x}'.format(int(avg_color[0]), int(avg_color[1]), int(avg_color[2]))
print(f"Hex Code: {hex_color}")
