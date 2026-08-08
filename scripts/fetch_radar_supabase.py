"""
Météo-France Radar Mosaic Processor with Supabase Storage
Downloads the radar mosaic package, extracts HDF5 files,
generates PNG images, and uploads them to Supabase Storage.
The manifest.json is also stored in Supabase for the frontend to read.

Can run locally or in GitHub Actions.
"""
import h5py
import numpy as np
from PIL import Image
import os
import sys
import json
import gzip
import io
import urllib.request
import time
import datetime

# ============================================================
# Configuration
# ============================================================

# Météo-France API
MF_API_KEY = os.environ.get('MF_RADAR_API_KEY', '')
MF_API_URL = "https://public-api.meteofrance.fr/public/DPPaquetRadar/v1/mosaique/paquet"

# Supabase Storage
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://ubdevaemtwbzxksjlhjg.supabase.co').strip().lstrip('\ufeff')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '').strip().lstrip('\ufeff').strip('"\'')
if not SUPABASE_KEY or SUPABASE_KEY.startswith('sb_secret_'):
    SUPABASE_KEY = 'sb_publishable_1qhA0xAnNSd3VxpoLdxYrQ_yUemEhaP'
STORAGE_BUCKET = 'radar-mf'

# Local fallback paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, '..')
LOCAL_OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'public', 'radar-mf')
LOCAL_MANIFEST = os.path.join(LOCAL_OUTPUT_DIR, 'manifest.json')

# Maximum number of frames to keep (2h = 24 frames at 5min intervals)
MAX_FRAMES = 24

# If no env vars, try to read from .env.local
if not MF_API_KEY or not SUPABASE_KEY:
    env_file = os.path.join(PROJECT_ROOT, '.env.local')
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('#') or '=' not in line:
                    continue
                key, val = line.split('=', 1)
                key = key.strip().lstrip('\ufeff')
                val = val.strip().strip('"\'')
                if key == 'VITE_METEO_RADAR_TOKEN' and not MF_API_KEY:
                    MF_API_KEY = val
                elif key == 'SUPABASE_SERVICE_ROLE_KEY' and not SUPABASE_KEY:
                    SUPABASE_KEY = val

# Also check for the hardcoded key from the existing script if env is empty
if not MF_API_KEY:
    # TRY HARDCODED WORKING TOKEN FIRST
    MF_API_KEY = "eyJ4NXQiOiJZV0kxTTJZNE1qWTNOemsyTkRZeU5XTTRPV014TXpjek1UVmhNbU14T1RSa09ETXlOVEE0Tnc9PSIsImtpZCI6ImdhdGV3YXlfY2VydGlmaWNhdGVfYWxpYXMiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJHcmVnNTk4ODBAY2FyYm9uLnN1cGVyIiwiYXBwbGljYXRpb24iOnsib3duZXIiOiJHcmVnNTk4ODAiLCJ0aWVyUXVvdGFUeXBlIjpudWxsLCJ0aWVyIjoiVW5saW1pdGVkIiwibmFtZSI6IkRlZmF1bHRBcHBsaWNhdGlvbiIsImlkIjoyMzg0MCwidXVpZCI6IjA3YTRhZjk0LWE4MzktNDllZC05MjJlLTAyZDMyMTM1ZjVlZSJ9LCJpc3MiOiJodHRwczpcL1wvcG9ydGFpbC1hcGkubWV0ZW9mcmFuY2UuZnI6NDQzXC9vYXV0aDJcL3Rva2VuIiwidGllckluZm8iOnsiNTBQZXJNaW4iOnsidGllclF1b3RhVHlwZSI6InJlcXVlc3RDb3VudCIsImdyYXBoUUxNYXhDb21wbGV4aXR5IjowLCJncmFwaFFMTWF4RGVwdGgiOjAsInN0b3BPblF1b3RhUmVhY2giOnRydWUsInNwaWtlQXJyZXN0TGltaXQiOjAsInNwaWtlQXJyZXN0VW5pdCI6InNlYyJ9LCI2MFJlcVBhck1pbiI6eyJ0aWVyUXVvdGFUeXBlIjoicmVxdWVzdENvdW50IiwiZ3JhcGhRTE1heENvbXBsZXhpdHkiOjAsImdyYXBoUUxNYXhEZXB0aCI6MCwic3RvcE9uUXVvdGFSZWFjaCI6dHJ1ZSwic3Bpa2VBcnJlc3RMaW1pdCI6MCwic3Bpa2VBcnJlc3RVbml0Ijoic2VjIn19LCJrZXl0eXBlIjoiUFJPRFVDVElPTiIsInN1YnNjcmliZWRBUElzIjpbeyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNWaWdpbGFuY2UiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQVmlnaWxhbmNlXC92MSIsInB1Ymxpc2hlciI6ImFkbWluIiwidmVyc2lvbiI6InYxIiwic3Vic2NyaXB0aW9uVGllciI6IjYwUmVxUGFyTWluIn0seyJzdWJzY3JpYmVyVGVuYW50RG9tYWluIjoiY2FyYm9uLnN1cGVyIiwibmFtZSI6IkRvbm5lZXNQdWJsaXF1ZXNPYnNlcnZhdGlvbiIsImNvbnRleHQiOiJcL3B1YmxpY1wvRFBPYnNcL3YxIiwicHVibGlzaGVyIjoiYmFzdGllbmciLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifSx7InN1YnNjcmliZXJUZW5hbnREb21haW4iOiJjYXJib24uc3VwZXIiLCJuYW1lIjoiRG9ubmVlc1B1YmxpcXVlc1BhcXVldE9ic2VydmF0aW9uIiwiY29udGV4dCI6IlwvcHVibGljXC9EUFBhcXVldE9ic1wvdjEiLCJwdWJsaXNoZXIiOiJiYXN0aWVuZyIsInZlcnNpb24iOiJ2MSIsInN1YnNjcmlwdGlvblRpZXIiOiI1MFBlck1pbiJ9LHsic3Vic2NyaWJlclRlbmFudERvbWFpbiI6ImNhcmJvbi5zdXBlciIsIm5hbWUiOiJEb25uZWVzUHVibGlxdWVzUGFxdWV0UmFkYXIiLCJjb250ZXh0IjoiXC9wdWJsaWNcL0RQUGFxdWV0UmFkYXJcL3YxIiwicHVibGlzaGVyIjoibG9pYy5tYXJ0aW4iLCJ2ZXJzaW9uIjoidjEiLCJzdWJzY3JpcHRpb25UaWVyIjoiNTBQZXJNaW4ifV0sImV4cCI6MTc5NTQ1NTk3MCwidG9rZW5fdHlwZSI6ImFwaUtleSIsImlhdCI6MTc2OTE1ODEyMCwianRpIjoiYzhjOWM4ODUtNTkwMi00MDcxLTliMmEtNzYzNjU2NjBlMTczIn0=.GwLM-0qaSCCn1meoV0a_zPE1vqoY-9bD0n951MuytlRfH_qB5udKEnaPZaa24ta7fO45QGwxqikX6do_Y0P-Hzhr3j1Fmtp6SQAt2xGgIQlv5fIf4SR8mv78mJto3J_Kmzccq66NpxFVr_BCZMkwN9STh-78PgVlJ6ympR9yCkHmYG8xBh8u3qvEHE5adCiIZ5su9Wl_ui25JQW0_ncc-lxjrBByp6Pmn1f33fGV6IG4gqs2xrhvh7VUeb_vSuG00JWn-2LFkKmyI-3uRxTqVi8o6xImihaSGkh-R-Xn8ixA4YHdniv2-AAI2AvVng12yXE8M2NPNlpNB_BUcOlt2w=="
    
    if not MF_API_KEY:
        # Read from fetch_radar_mf.py as secondary fallback
        old_script = os.path.join(SCRIPT_DIR, 'fetch_radar_mf.py')
        if os.path.exists(old_script):
            with open(old_script, 'r') as f:
                content = f.read()
            import re
            match = re.search(r'MF_API_KEY\s*=\s*"([^"]+)"', content)
            if match:
                MF_API_KEY = match.group(1)

# ============================================================
# Official Météo-France precipitation color palette (mm/h)
# ============================================================
RAIN_PALETTE = [
    (0.0,    0.1,    0,   0,   0,   0),
    (0.1,    0.15,   4,   4,  132, 200),
    (0.15,   0.2,    4,   20, 156, 210),
    (0.2,    0.3,    4,   40, 180, 215),
    (0.3,    0.4,    4,   64, 204, 220),
    (0.4,    0.5,    4,   88, 220, 220),
    (0.5,    0.6,    4,  112, 236, 225),
    (0.6,    0.9,    4,  140, 252, 225),
    (0.9,    1.2,   20, 168, 220, 225),
    (1.2,    1.5,    8,  180,  8,  230),
    (1.5,    2.0,   24, 200,  24, 230),
    (2.0,    2.7,   60, 216,  60, 230),
    (2.7,    3.7,  100, 232, 100, 230),
    (3.7,    4.8,  180, 232,  20, 235),
    (4.8,    6.0,  232, 232,   4, 235),
    (6.0,    8.0,  252, 216,   4, 235),
    (8.0,   12.0,  252, 176,   4, 240),
    (12.0,  16.0,  252, 132,   4, 240),
    (16.0,  27.0,  252,  88,   4, 240),
    (27.0,  37.0,  252,  36,   4, 245),
    (37.0,  48.0,  220,   4,   4, 245),
    (48.0,  65.0,  188,   4,   4, 245),
    (65.0,  85.0,  176,   4, 100, 250),
    (85.0, 120.0,  160,   4, 160, 250),
    (120.0, 150.0, 176,  44, 200, 250),
    (150.0, 210.0, 200,  80, 220, 250),
    (210.0, 278.0, 220, 120, 240, 250),
    (278.0, 370.0, 236, 160, 248, 250),
    (370.0, 486.0, 248, 200, 252, 250),
    (486.0, 999.0, 255, 240, 255, 255),
]

# ============================================================
# Supabase Storage Helpers
# ============================================================

def supabase_request(method, path, data=None, content_type='application/json'):
    """Make an authenticated request to Supabase Storage API."""
    url = f"{SUPABASE_URL}/storage/v1{path}"
    
    if isinstance(data, (dict, list)):
        body = json.dumps(data).encode('utf-8')
    elif isinstance(data, bytes):
        body = data
    elif data is None:
        body = None
    else:
        body = str(data).encode('utf-8')
    
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('apikey', SUPABASE_KEY)
    if content_type:
        req.add_header('Content-Type', content_type)
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            resp_data = response.read()
            try:
                return json.loads(resp_data)
            except:
                return resp_data
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        print(f"  Supabase API Error {e.code}: {error_body[:200]}")
        return None

def ensure_bucket_exists():
    """Create the storage bucket if it doesn't exist."""
    # Try to get bucket info
    result = supabase_request('GET', f'/bucket/{STORAGE_BUCKET}')
    if result and isinstance(result, dict) and result.get('id') == STORAGE_BUCKET:
        return True
    
    # Create bucket (public for read access)
    result = supabase_request('POST', '/bucket', {
        'id': STORAGE_BUCKET,
        'name': STORAGE_BUCKET,
        'public': True,
        'file_size_limit': 5 * 1024 * 1024,  # 5MB max per file
        'allowed_mime_types': ['image/png', 'application/json']
    })
    if result:
        print(f"  Created bucket '{STORAGE_BUCKET}'")
        return True
    return False

def upload_to_supabase(filename, data, content_type, bucket=None):
    """Upload data to Supabase Storage."""
    target_bucket = bucket or STORAGE_BUCKET
    path = f"/object/{target_bucket}/{filename}"
    
    url = f"{SUPABASE_URL}/storage/v1{path}"
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('apikey', SUPABASE_KEY)
    req.add_header('Content-Type', content_type)
    req.add_header('x-upsert', 'true')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return True
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        print(f"  Upload Error {e.code} for {filename} in {target_bucket}: {error_body[:200]}")
        return False

def delete_from_supabase(filename, bucket=None):
    """Delete a file from Supabase Storage."""
    target_bucket = bucket or STORAGE_BUCKET
    result = supabase_request('DELETE', f'/object/{target_bucket}', [filename])
    return result is not None

def get_public_url(filename, bucket=None):
    """Get the public URL for a file in Supabase Storage."""
    target_bucket = bucket or STORAGE_BUCKET
    return f"{SUPABASE_URL}/storage/v1/object/public/{target_bucket}/{filename}"

def get_existing_manifest():
    """Fetch the existing manifest from Supabase Storage."""
    url = get_public_url('manifest.json') + f'?t={int(time.time())}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read())
    except:
        return None

# ============================================================
# Core Processing
# ============================================================

def download_radar_package():
    """Download the radar mosaic package from Meteo-France."""
    print("[1/4] Downloading radar package from Meteo-France...")
    req = urllib.request.Request(MF_API_URL)
    req.add_header('apikey', MF_API_KEY)
    req.add_header('Accept', 'application/gzip')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
            print(f"  Downloaded {len(data)} bytes")
            return data
    except Exception as e:
        print(f"  ERROR downloading: {e}")
        return None

def extract_h5_files(gzip_data):
    """Extract IPRN20 (metropole) HDF5 files from the tar.gz package."""
    print("[2/4] Extracting HDF5 files...")
    decompressed = gzip.decompress(gzip_data)
    
    h5_files = {}
    offset = 0
    while offset < len(decompressed) - 512:
        name_raw = decompressed[offset:offset+100].decode('utf8', errors='replace')
        name = name_raw.replace('\0', '').strip()
        if not name:
            break
        
        size_str = decompressed[offset+124:offset+136].decode('utf8', errors='replace').replace('\0', '').strip()
        size = int(size_str, 8) if size_str else 0
        
        if not name.startswith('././@') and 'IPRN' in name and name.endswith('.h5'):
            data = decompressed[offset+512:offset+512+size]
            parts = name.replace('.h5', '').split('_')
            ts_str = parts[-1]
            h5_files[ts_str] = data
            print(f"  Found: {os.path.basename(name)} ({size} bytes, ts={ts_str})")
        
        offset += 512 + ((size + 511) // 512) * 512
    
    return h5_files

def h5_to_png_bytes(h5_data, timestamp_str):
    """Convert HDF5 radar data to PNG bytes with official MF palette."""
    import tempfile
    tmp_path = os.path.join(tempfile.gettempdir(), f'_radar_{timestamp_str}.h5')
    
    with open(tmp_path, 'wb') as f:
        f.write(h5_data)
    
    try:
        with h5py.File(tmp_path, 'r') as f:
            data = f['dataset1/data1/data'][()]
            
            what = f['dataset1/data1/what']
            gain = what.attrs.get('gain', 0.01)
            offset_val = what.attrs.get('offset', 0.0)
            nodata = what.attrs.get('nodata', 65535.0)
            undetect = what.attrs.get('undetect', 65534.0)
            
            where = f['where']
            xsize = int(where.attrs.get('xsize', 3472))
            ysize = int(where.attrs.get('ysize', 3472))
            
            bounds = {
                'UL_lat': float(where.attrs.get('UL_lat', 53.67)),
                'UL_lon': float(where.attrs.get('UL_lon', -9.965)),
                'UR_lat': float(where.attrs.get('UR_lat', 52.55)),
                'UR_lon': float(where.attrs.get('UR_lon', 17.56)),
                'LL_lat': float(where.attrs.get('LL_lat', 38.14)),
                'LL_lon': float(where.attrs.get('LL_lon', -6.72)),
                'LR_lat': float(where.attrs.get('LR_lat', 37.46)),
                'LR_lon': float(where.attrs.get('LR_lon', 11.98)),
            }
        
        # Mask invalid pixels FIRST
        mask_nodata = (data == int(nodata))
        mask_undetect = (data == int(undetect))
        mask_invalid = mask_nodata | mask_undetect
        
        clean_data = data.astype(np.float64)
        clean_data[mask_invalid] = 0.0
        
        mm_accum = clean_data * gain + offset_val
        mm_accum[mask_invalid] = 0.0
        mmh_data = mm_accum * 12.0
        
        # Native Resolution (1x) for MAXIMUM precision
        scale = 1
        h_new = ysize // scale
        w_new = xsize // scale
        mmh_small = mmh_data[:h_new*scale, :w_new*scale].reshape(h_new, scale, w_new, scale).mean(axis=(1,3))
        mask_small = mask_invalid[:h_new*scale, :w_new*scale].reshape(h_new, scale, w_new, scale).all(axis=(1,3))
        
        # Create RGBA image
        img = np.zeros((h_new, w_new, 4), dtype=np.uint8)
        
        for min_v, max_v, r, g, b, a in RAIN_PALETTE:
            mask_range = (mmh_small >= min_v) & (mmh_small < max_v) & ~mask_small
            img[mask_range] = [r, g, b, a]
        
        img[mask_small] = [0, 0, 0, 0]
        
        # Convert to PNG bytes
        pil_img = Image.fromarray(img, 'RGBA')
        buf = io.BytesIO()
        pil_img.save(buf, format='PNG', optimize=True)
        png_bytes = buf.getvalue()
        
        # Stats
        valid_mask = ~mask_small & (mmh_small > 0.1)
        num_rain_px = int(np.sum(valid_mask))
        max_mmh = float(np.max(mmh_small[~mask_small])) if np.any(~mask_small) else 0
        
        print(f"  Processed: radar_{timestamp_str}.png ({w_new}x{h_new}, {len(png_bytes)//1024}KB, rain={num_rain_px}px, max={max_mmh:.1f}mm/h)")
        
        return png_bytes, bounds, [w_new, h_new]
    
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def build_manifest(frames, bounds):
    """Build the manifest.json content."""
    return {
        'generated_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'source': 'Meteo-France DPPaquetRadar/v1',
        'storage': 'supabase',
        'base_url': get_public_url(''),
        'bounds': bounds,
        'leaflet_bounds': [
            [bounds.get('LL_lat', 38.14), bounds.get('UL_lon', -9.965)],
            [bounds.get('UL_lat', 53.67), bounds.get('UR_lon', 17.56)]
        ] if bounds else [],
        'frame_count': len(frames),
        'frames': frames,
    }

# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("Meteo-France Radar -> Supabase Storage")
    print("=" * 60)
    
    use_supabase = bool(SUPABASE_KEY)
    
    if use_supabase:
        print(f"  Mode: SUPABASE ({SUPABASE_URL})")
        if not ensure_bucket_exists():
            print("  WARNING: Could not ensure bucket exists, will try anyway")
        # Ensure archive bucket exists as well
        supabase_request('POST', '/bucket', {
            'id': 'radar-archive',
            'name': 'radar-archive',
            'public': True
        })
    else:
        print(f"  Mode: LOCAL ({LOCAL_OUTPUT_DIR})")
        os.makedirs(LOCAL_OUTPUT_DIR, exist_ok=True)
    
    # Step 1: Download
    package = download_radar_package()
    if not package:
        print("FAILED: Could not download radar package")
        sys.exit(1)
    
    # Step 2: Extract HDF5
    h5_files = extract_h5_files(package)
    if not h5_files:
        print("FAILED: No HDF5 files found")
        sys.exit(1)
    
    # Step 3: Get existing manifest to know what frames we already have
    existing_frames = {}
    if use_supabase:
        manifest = get_existing_manifest()
        if manifest:
            existing_frames = {f['timestamp']: f for f in manifest.get('frames', [])}
            print(f"  Existing manifest: {len(existing_frames)} frames")
    elif os.path.exists(LOCAL_MANIFEST):
        with open(LOCAL_MANIFEST) as f:
            manifest = json.load(f)
            existing_frames = {f['timestamp']: f for f in manifest.get('frames', [])}
    
    # Step 4: Convert new frames and upload
    print("[3/4] Converting HDF5 to PNG and uploading...")
    new_frames = dict(existing_frames)  # Start with existing
    latest_bounds = {}
    
    for ts_str, h5_data in sorted(h5_files.items()):
        filename = f'radar_{ts_str}.png'
        
        # Skip if already exists
        if ts_str in existing_frames:
            print(f"  Skipping (exists): {filename}")
            continue
        
        # Convert
        png_bytes, bounds, size = h5_to_png_bytes(h5_data, ts_str)
        latest_bounds = bounds
        
        frame_info = {
            'filename': filename,
            'timestamp': ts_str,
            'bounds': bounds,
            'size': size,
        }
        
        if use_supabase:
            # Upload PNG to Supabase Storage (LIVE)
            if upload_to_supabase(filename, png_bytes, 'image/png'):
                new_frames[ts_str] = frame_info
                
                # ARCHIVE: If top of the hour (HH:00), upload to archive bucket
                if ts_str.endswith('0000'):
                    year = ts_str[0:4]
                    month = ts_str[4:6]
                    archive_path = f"{year}/{month}/{filename}"
                    print(f"  Archiving: {archive_path}...")
                    upload_to_supabase(archive_path, png_bytes, 'image/png', bucket='radar-archive')
            else:
                print(f"  FAILED upload: {filename}")
        else:
            # Save locally
            png_path = os.path.join(LOCAL_OUTPUT_DIR, filename)
            with open(png_path, 'wb') as f:
                f.write(png_bytes)
            new_frames[ts_str] = frame_info
    
    # Step 5: Cleanup old frames (keep only MAX_FRAMES)
    print("[4/4] Updating manifest and cleaning old frames...")
    sorted_keys = sorted(new_frames.keys())
    
    if len(sorted_keys) > MAX_FRAMES:
        to_remove = sorted_keys[:-MAX_FRAMES]
        for old_ts in to_remove:
            old_filename = new_frames[old_ts]['filename']
            if use_supabase:
                delete_from_supabase(old_filename)
            else:
                old_path = os.path.join(LOCAL_OUTPUT_DIR, old_filename)
                if os.path.exists(old_path):
                    os.remove(old_path)
            del new_frames[old_ts]
            print(f"  Cleaned: {old_filename}")
    
    # Build and upload manifest
    final_frames = [new_frames[k] for k in sorted(new_frames.keys())]
    if final_frames:
        latest_bounds = latest_bounds or final_frames[-1].get('bounds', {})
    
    manifest = build_manifest(final_frames, latest_bounds)
    
    if use_supabase:
        manifest_bytes = json.dumps(manifest, indent=2).encode('utf-8')
        if upload_to_supabase('manifest.json', manifest_bytes, 'application/json'):
            print(f"  Manifest uploaded: {len(final_frames)} frames")
            print(f"  Public URL: {get_public_url('manifest.json')}")
        else:
            print("  FAILED to upload manifest!")
    else:
        with open(LOCAL_MANIFEST, 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f"  Manifest saved locally: {len(final_frames)} frames")
    
    print(f"\n[OK] Done! {len(final_frames)} radar frames available")

if __name__ == '__main__':
    main()
