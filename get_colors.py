from PIL import Image
import numpy as np
import os

def get_hex_color(filename):
    if not os.path.exists(filename):
        return f"{filename} not found"
    img = Image.open(filename).convert("RGB")
    data = np.array(img)
    avg_color = np.mean(data, axis=(0, 1))
    return '#{:02x}{:02x}{:02x}'.format(int(avg_color[0]), int(avg_color[1]), int(avg_color[2]))

for i in range(4):
    fname = f"input_file_{i}.png"
    print(f"{fname}: {get_hex_color(fname)}")
