import sys
import os
import cv2
import numpy as np

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

        # Parse background color
        if args.bg_color:
            bg_color_parts = args.bg_color.split(',')
            bg_r = int(bg_color_parts[0])
            bg_g = int(bg_color_parts[1])
            bg_b = int(bg_color_parts[2])
        else:
            bg_r, bg_g, bg_b = 255, 255, 255  # Default to white
            
        # Use generalized background color for OpenCV
        bg_max = np.max([bg_b, bg_g, bg_r])
        bg_min = np.min([bg_b, bg_g, bg_r])
        is_colorful_bg = (bg_max - bg_min) > 40
        dom_idx = np.argmax([bg_b, bg_g, bg_r]) if is_colorful_bg else -1
        is_dark_bg = bg_max < 128

        lower_threshold = args.lower_threshold
        upper_threshold = args.upper_threshold
        
        # Process in chunks to prevent huge memory spikes for very large images
        chunk_size = 2000
        height, width = img.shape[:2]
        
        for y in range(0, height, chunk_size):
            end_y = min(y + chunk_size, height)
            chunk = img[y:end_y]
            
            b, g, r, a = cv2.split(chunk)
            
            b_int = b.astype(np.int16)
            g_int = g.astype(np.int16)
            r_int = r.astype(np.int16)
            
            if is_colorful_bg:
                if dom_idx == 0:
                    diff = b_int - np.maximum(r_int, g_int)
                elif dom_idx == 1:
                    diff = g_int - np.maximum(r_int, b_int)
                else:
                    diff = r_int - np.maximum(g_int, b_int)
                
                # Map the diff values so that the user's default sliders (220 to 250)
                # perfectly match the ideal hardcoded thresholds for colorful matting.
                closeness = diff + 215
            else:
                if is_dark_bg:
                    closeness = 255 - np.maximum(np.maximum(r_int, g_int), b_int)
                else:
                    closeness = np.minimum(np.minimum(r_int, g_int), b_int)
            
            closeness = np.clip(closeness, 0, 255)
            
            # --- Vectorized Alpha Matting ---
            if upper_threshold == lower_threshold:
                alpha_mask = np.where(closeness >= upper_threshold, 0.0, 1.0).astype(np.float32)
            else:
                ratio = (closeness.astype(np.float32) - lower_threshold) / (upper_threshold - lower_threshold)
                alpha_mask = 1.0 - ratio
                alpha_mask = np.where(closeness <= lower_threshold, 1.0, alpha_mask)
                alpha_mask = np.where(closeness >= upper_threshold, 0.0, alpha_mask)
                alpha_mask = np.clip(alpha_mask, 0.0, 1.0)
            
            # Merge Original Alpha with new Alpha Mask
            final_a = (a.astype(np.float32) / 255.0) * alpha_mask
            final_a = (final_a * 255.0).astype(np.uint8)
            
            # --- Generalized Spill Suppression ---
            final_r = r.copy()
            final_g = g.copy()
            final_b = b.copy()
            
            if is_colorful_bg:
                # Calculate an intrinsic spill ratio based on diff, decoupled from user thresholds
                spill_amount = np.clip((diff.astype(np.float32) - 5) / 30.0, 0.0, 1.0)
                mask_spill = spill_amount > 0.0
                
                if dom_idx == 0: # Blue dominant
                    suppressed = np.minimum(b, np.maximum(r, g))
                    final_b[mask_spill] = (b[mask_spill] * (1.0 - spill_amount[mask_spill]) + suppressed[mask_spill] * spill_amount[mask_spill]).astype(np.uint8)
                elif dom_idx == 1: # Green dominant
                    suppressed = np.minimum(g, np.maximum(r, b))
                    final_g[mask_spill] = (g[mask_spill] * (1.0 - spill_amount[mask_spill]) + suppressed[mask_spill] * spill_amount[mask_spill]).astype(np.uint8)
                elif dom_idx == 2: # Red dominant
                    suppressed = np.minimum(r, np.maximum(g, b))
                    final_r[mask_spill] = (r[mask_spill] * (1.0 - spill_amount[mask_spill]) + suppressed[mask_spill] * spill_amount[mask_spill]).astype(np.uint8)
            
            # Update the chunk in the original image
            img[y:end_y] = cv2.merge((final_b, final_g, final_r, final_a))
            
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
    parser.add_argument("--lower_threshold", type=int, default=220)
    parser.add_argument("--upper_threshold", type=int, default=250)
    parser.add_argument("--bg_color", type=str, default="255,255,255")
    
    args = parser.parse_args()
    perform_matting(args.input_path, args.output_path, args)
