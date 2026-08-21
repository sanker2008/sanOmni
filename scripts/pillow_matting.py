import sys
import os
import cv2
import numpy as np

def parse_bg_color(bg_color_str):
    if not bg_color_str:
        return 255, 255, 255
    bg_color_str = bg_color_str.strip()
    if bg_color_str.startswith('#'):
        hex_val = bg_color_str.lstrip('#')
        if len(hex_val) == 6:
            return int(hex_val[0:2], 16), int(hex_val[2:4], 16), int(hex_val[4:6], 16)
    parts = [int(c.strip()) for c in bg_color_str.split(',')]
    if len(parts) >= 3:
        return parts[0], parts[1], parts[2]
    return 255, 255, 255

def perform_matting(image_path, output_path, args):
    try:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Input file not found: {image_path}")

        # Ensure the image has an alpha channel
        # Use numpy to handle unicode file paths on Windows
        img_data = np.fromfile(image_path, dtype=np.uint8)
        img = cv2.imdecode(img_data, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Could not load image from {image_path}")
            
        # Ensure 4 channels (BGRA)
        if len(img.shape) == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
        elif img.shape[2] == 3:
            img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

        # Parse target background color (RGB)
        bg_r, bg_g, bg_b = parse_bg_color(getattr(args, 'bg_color', '255,255,255'))
        bg_b_f, bg_g_f, bg_r_f = float(bg_b), float(bg_g), float(bg_r)

        lower_threshold = float(args.lower_threshold)
        upper_threshold = float(args.upper_threshold)
        
        # Process in chunks to prevent huge memory spikes for very large images
        chunk_size = 2000
        height, width = img.shape[:2]
        
        for y in range(0, height, chunk_size):
            end_y = min(y + chunk_size, height)
            chunk = img[y:end_y]
            
            b, g, r, a = cv2.split(chunk)
            
            b_f = b.astype(np.float32)
            g_f = g.astype(np.float32)
            r_f = r.astype(np.float32)
            
            # Universal normalized Euclidean distance in RGB color space [0, 255]
            dist = np.sqrt((b_f - bg_b_f)**2 + (g_f - bg_g_f)**2 + (r_f - bg_r_f)**2) / np.sqrt(3.0)
            similarity = 255.0 - dist
            
            # --- Vectorized Alpha Matting ---
            if upper_threshold <= lower_threshold:
                alpha_mask = np.where(similarity >= upper_threshold, 0.0, 1.0).astype(np.float32)
            else:
                ratio = (similarity - lower_threshold) / (upper_threshold - lower_threshold)
                alpha_mask = 1.0 - ratio
                alpha_mask = np.where(similarity <= lower_threshold, 1.0, alpha_mask)
                alpha_mask = np.where(similarity >= upper_threshold, 0.0, alpha_mask)
                alpha_mask = np.clip(alpha_mask, 0.0, 1.0)
            
            # Merge Original Alpha with new Alpha Mask
            orig_a = a.astype(np.float32) / 255.0
            final_a = orig_a * alpha_mask
            
            # --- Analytical Color Decontamination / Spill Suppression ---
            # For anti-aliased edge pixels, un-blend the background color
            mask_feather = (final_a > 0.001) & (final_a < 0.999)
            alpha_safe = np.maximum(final_a, 0.001)
            
            rec_b = np.where(mask_feather, (b_f - (1.0 - final_a) * bg_b_f) / alpha_safe, b_f)
            rec_g = np.where(mask_feather, (g_f - (1.0 - final_a) * bg_g_f) / alpha_safe, g_f)
            rec_r = np.where(mask_feather, (r_f - (1.0 - final_a) * bg_r_f) / alpha_safe, r_f)
            
            final_b = np.clip(rec_b, 0, 255).astype(np.uint8)
            final_g = np.clip(rec_g, 0, 255).astype(np.uint8)
            final_r = np.clip(rec_r, 0, 255).astype(np.uint8)
            final_a_u8 = (final_a * 255.0).astype(np.uint8)
            
            # --- Spatial Edge Defringing (Removes halo from compression/interpolation) ---
            # If background is colorful or contrasty, clean boundary pixels
            is_colorful = (max(bg_r, bg_g, bg_b) - min(bg_r, bg_g, bg_b)) > 30
            if is_colorful:
                solid_core = (final_a >= 0.95).astype(np.uint8)
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
                b_dilated = cv2.dilate(np.where(solid_core, final_b, 0), kernel, iterations=2)
                g_dilated = cv2.dilate(np.where(solid_core, final_g, 0), kernel, iterations=2)
                r_dilated = cv2.dilate(np.where(solid_core, final_r, 0), kernel, iterations=2)
                
                fringe_mask = (similarity > 100) & (final_a > 0)
                has_dilated = (b_dilated > 0) | (g_dilated > 0) | (r_dilated > 0)
                replace_zone = fringe_mask & has_dilated
                
                final_b[replace_zone] = b_dilated[replace_zone]
                final_g[replace_zone] = g_dilated[replace_zone]
                final_r[replace_zone] = r_dilated[replace_zone]
            
            # Update the chunk in the original image
            img[y:end_y] = cv2.merge((final_b, final_g, final_r, final_a_u8))
            
        # Use numpy to handle unicode output paths on Windows
        is_success, im_buf_arr = cv2.imencode(".png", img)
        if is_success:
            im_buf_arr.tofile(output_path)
            print(f"Successfully saved to: {output_path}")
        else:
            raise ValueError(f"Failed to encode image to PNG for saving.")
        
    except Exception as e:
        print(f"Error during matting process: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path")
    parser.add_argument("output_path")
    parser.add_argument("--lower_threshold", type=float, default=220.0)
    parser.add_argument("--upper_threshold", type=float, default=250.0)
    parser.add_argument("--bg_color", type=str, default="255,255,255")
    
    args = parser.parse_args()
    perform_matting(args.input_path, args.output_path, args)
