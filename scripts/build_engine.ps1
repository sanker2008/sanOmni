# Build Script for Pro Background Removal Engine
# 需要在拥有完整依赖的 Python 环境中执行

Write-Host "Checking dependencies..."
python -c "import rembg; import PIL; import cv2" 
if ($LASTEXITCODE -ne 0) {
    Write-Host "Missing dependencies! Please run: pip install rembg Pillow opencv-python pyinstaller" -ForegroundColor Red
    exit 1
}

Write-Host "Installing PyInstaller if needed..."
pip install pyinstaller

Write-Host "Starting PyInstaller build..."
# 使用 --onedir 或者 --onefile 打包
# 这里使用 --onedir 因为 rembg 包含大量 onnx runtime 的 C++ 依赖库，打包成单文件启动极慢且容易出错。
# --onedir 会生成一个包含 exe 和 dll 的文件夹。

Write-Host "Building perfect_matting.exe (IS-Net Strategy B)..."
pyinstaller --noconfirm --onedir --console --name "perfect_matting" .\perfect_matting.py

Write-Host "Building pillow_matting.exe (Pillow Strategy A)..."
pyinstaller --noconfirm --onefile --console --name "pillow_matting" .\pillow_matting.py

Write-Host "Build complete! Check the 'dist' folder for perfect_matting and pillow_matting" -ForegroundColor Green
