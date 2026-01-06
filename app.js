class WaveformVideoGenerator {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.chunks = [];
        this.mediaRecorder = null;

        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.generateBtn = document.getElementById('generateBtn');
        this.progress = document.getElementById('progress');
        this.progressFill = document.getElementById('progressFill');
        this.status = document.getElementById('status');
        this.downloadLink = document.getElementById('downloadLink');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.waveColorInput = document.getElementById('waveColor');
        this.bgColorInput = document.getElementById('bgColor');
        this.videoSizeSelect = document.getElementById('videoSize');
        this.fpsSelect = document.getElementById('fps');
    }

    setupEventListeners() {
        this.uploadArea.addEventListener('click', () => this.fileInput.click());

        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().endsWith('.wav')) {
                this.loadAudioFile(file);
            } else {
                alert('WAVファイルを選択してください');
            }
        });

        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadAudioFile(file);
            }
        });

        this.generateBtn.addEventListener('click', () => this.generateVideo());
    }

    async loadAudioFile(file) {
        try {
            this.status.textContent = '音声ファイルを読み込み中...';

            const arrayBuffer = await file.arrayBuffer();

            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.uploadArea.querySelector('h3').textContent = `✓ ${file.name}`;
            this.uploadArea.querySelector('p').textContent =
                `${this.audioBuffer.duration.toFixed(2)}秒 | ${this.audioBuffer.sampleRate}Hz`;

            this.generateBtn.disabled = false;
            this.status.textContent = '準備完了！';
        } catch (error) {
            console.error('ファイル読み込みエラー:', error);
            alert('WAVファイルの読み込みに失敗しました。正しいWAVファイルか確認してください。');
        }
    }

    async generateVideo() {
        try {
            this.generateBtn.disabled = true;
            this.progress.style.display = 'block';
            this.downloadLink.style.display = 'none';
            this.canvas.style.display = 'block';

            const [width, height] = this.videoSizeSelect.value.split(',').map(Number);
            const fps = parseInt(this.fpsSelect.value);
            const waveColor = this.waveColorInput.value;
            const bgColor = this.bgColorInput.value;

            this.canvas.width = width;
            this.canvas.height = height;

            this.updateProgress(0, '動画の準備中...');

            const channelData = this.audioBuffer.getChannelData(0);
            const duration = this.audioBuffer.duration;
            const totalFrames = Math.ceil(duration * fps);
            const samplesPerFrame = Math.floor(channelData.length / totalFrames);

            const stream = this.canvas.captureStream(fps);
            const options = {
                mimeType: 'video/webm;codecs=vp9',
                videoBitsPerSecond: 5000000
            };

            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'video/webm;codecs=vp8';
            }

            this.chunks = [];
            this.mediaRecorder = new MediaRecorder(stream, options);

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                this.downloadBtn.href = url;
                this.downloadLink.style.display = 'block';
                this.updateProgress(100, '完了！');
                this.generateBtn.disabled = false;
            };

            this.mediaRecorder.start();
            this.updateProgress(5, '動画の生成中...');

            const frameInterval = 1000 / fps;
            let currentFrame = 0;

            const renderFrame = () => {
                if (currentFrame >= totalFrames) {
                    this.mediaRecorder.stop();
                    return;
                }

                const startSample = currentFrame * samplesPerFrame;
                const endSample = Math.min(startSample + samplesPerFrame, channelData.length);
                const frameData = channelData.slice(startSample, endSample);

                this.drawWaveform(frameData, waveColor, bgColor, width, height);

                const progress = ((currentFrame + 1) / totalFrames) * 90 + 5;
                this.updateProgress(progress, `フレーム ${currentFrame + 1}/${totalFrames} を生成中...`);

                currentFrame++;
                setTimeout(renderFrame, frameInterval);
            };

            renderFrame();

        } catch (error) {
            console.error('動画生成エラー:', error);
            alert('動画の生成に失敗しました: ' + error.message);
            this.generateBtn.disabled = false;
            this.progress.style.display = 'none';
        }
    }

    drawWaveform(data, waveColor, bgColor, width, height) {
        this.ctx.fillStyle = bgColor;
        this.ctx.fillRect(0, 0, width, height);

        this.ctx.strokeStyle = waveColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();

        const sliceWidth = width / data.length;
        const centerY = height / 2;
        const amplitude = height / 2 * 0.8;

        for (let i = 0; i < data.length; i++) {
            const x = i * sliceWidth;
            const y = centerY + (data[i] * amplitude);

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }

        this.ctx.stroke();

        this.ctx.strokeStyle = waveColor + '40';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(width, centerY);
        this.ctx.stroke();
    }

    updateProgress(percent, message) {
        this.progressFill.style.width = percent + '%';
        this.progressFill.textContent = Math.round(percent) + '%';
        this.status.textContent = message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new WaveformVideoGenerator();
});
