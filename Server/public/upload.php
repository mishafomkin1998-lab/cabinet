<?php
// Временный скрипт для загрузки файлов
// УДАЛИТЬ ПОСЛЕ ИСПОЛЬЗОВАНИЯ!

$uploadDir = __DIR__ . '/';
$downloadDir = __DIR__ . '/download/';

if (!is_dir($downloadDir)) {
    mkdir($downloadDir, 0755, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $fileName = $_FILES['file']['name'];

    // Определяем куда загружать
    if (strpos($fileName, 'logo') !== false || strpos($fileName, 'Лого') !== false || strpos($fileName, 'Ярлык') !== false) {
        $targetDir = $uploadDir;
        // Переименовываем логотип
        if (strpos($fileName, 'Лого') !== false) {
            $fileName = 'nova-logo.png';
        }
    } else {
        $targetDir = $downloadDir;
    }

    $targetFile = $targetDir . basename($fileName);

    if (move_uploaded_file($_FILES['file']['tmp_name'], $targetFile)) {
        echo json_encode(['success' => true, 'file' => $fileName, 'path' => $targetFile]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Upload failed']);
    }
    exit;
}
?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Upload Files - Novabot</title>
    <style>
        body { font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px; }
        .upload-box { border: 2px dashed #ccc; padding: 40px; text-align: center; border-radius: 10px; }
        .upload-box.dragover { background: #e3f2fd; border-color: #2196F3; }
        input[type="file"] { margin: 20px 0; }
        .result { margin-top: 20px; padding: 10px; border-radius: 5px; }
        .success { background: #4CAF50; color: white; }
        .error { background: #f44336; color: white; }
        .file-list { margin-top: 20px; text-align: left; }
        .file-item { padding: 10px; background: #f5f5f5; margin: 5px 0; border-radius: 5px; }
    </style>
</head>
<body>
    <h1>🚀 Загрузка файлов Novabot</h1>

    <div class="upload-box" id="dropZone">
        <h2>Перетащите файлы сюда или выберите</h2>
        <input type="file" id="fileInput" multiple>
        <p style="color: #666;">Логотипы → /public/<br>Установщики → /public/download/</p>
    </div>

    <div class="file-list" id="fileList"></div>

    <div id="result"></div>

    <script>
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const resultDiv = document.getElementById('result');
        const fileListDiv = document.getElementById('fileList');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            uploadFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', (e) => {
            uploadFiles(e.target.files);
        });

        async function uploadFiles(files) {
            fileListDiv.innerHTML = '<h3>Загружаем файлы...</h3>';

            for (let file of files) {
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('upload.php', {
                        method: 'POST',
                        body: formData
                    });

                    const result = await response.json();

                    if (result.success) {
                        fileListDiv.innerHTML += `<div class="file-item">✅ ${result.file} → ${result.path}</div>`;
                    } else {
                        fileListDiv.innerHTML += `<div class="file-item" style="background:#ffebee;">❌ ${file.name} - ${result.error}</div>`;
                    }
                } catch (error) {
                    fileListDiv.innerHTML += `<div class="file-item" style="background:#ffebee;">❌ ${file.name} - ${error}</div>`;
                }
            }

            fileListDiv.innerHTML += '<div style="margin-top:20px;"><strong>✅ Готово! Не забудьте удалить upload.php после загрузки!</strong></div>';
        }
    </script>
</body>
</html>
