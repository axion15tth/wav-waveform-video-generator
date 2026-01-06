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
        if (!('VideoEncoder' in window)) {
            alert('お使いのブラウザはWebCodecs APIに対応していません。Chrome 94以降をお使いください。');
            return;
        }

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

            const muxer = new WebMMuxer.Muxer({
                target: new WebMMuxer.ArrayBufferTarget(),
                video: {
                    codec: 'V_VP9',
                    width: width,
                    height: height,
                    frameRate: fps
                },
                audio: {
                    codec: 'A_OPUS',
                    numberOfChannels: this.audioBuffer.numberOfChannels,
                    sampleRate: this.audioBuffer.sampleRate
                }
            });

            const videoEncoder = new VideoEncoder({
                output: (chunk, metadata) => {
                    muxer.addVideoChunk(chunk, metadata);
                },
                error: (e) => {
                    console.error('Video encoding error:', e);
                }
            });

            videoEncoder.configure({
                codec: 'vp09.00.10.08',
                width: width,
                height: height,
                bitrate: 5000000,
                framerate: fps
            });

            const audioEncoder = new AudioEncoder({
                output: (chunk, metadata) => {
                    muxer.addAudioChunk(chunk, metadata);
                },
                error: (e) => {
                    console.error('Audio encoding error:', e);
                }
            });

            audioEncoder.configure({
                codec: 'opus',
                sampleRate: this.audioBuffer.sampleRate,
                numberOfChannels: this.audioBuffer.numberOfChannels,
                bitrate: 128000
            });

            this.updateProgress(5, '高速レンダリング中...');

            for (let frame = 0; frame < totalFrames; frame++) {
                const startSample = frame * samplesPerFrame;
                const endSample = Math.min(startSample + samplesPerFrame, channelData.length);
                const frameData = channelData.slice(startSample, endSample);

                this.drawWaveform(frameData, waveColor, bgColor, width, height);

                const videoFrame = new VideoFrame(this.canvas, {
                    timestamp: (frame * 1000000) / fps
                });

                videoEncoder.encode(videoFrame, { keyFrame: frame % 150 === 0 });
                videoFrame.close();

                const progress = 5 + ((frame + 1) / totalFrames) * 70;
                this.updateProgress(progress, `フレーム ${frame + 1}/${totalFrames} を処理中...`);

                if (frame % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            this.updateProgress(80, '音声をエンコード中...');

            const audioData = [];
            for (let ch = 0; ch < this.audioBuffer.numberOfChannels; ch++) {
                audioData.push(this.audioBuffer.getChannelData(ch));
            }

            const frameSize = 960;
            const totalAudioFrames = Math.ceil(this.audioBuffer.length / frameSize);

            for (let i = 0; i < totalAudioFrames; i++) {
                const start = i * frameSize;
                const end = Math.min(start + frameSize, this.audioBuffer.length);
                const length = end - start;

                const audioFrameData = audioData.map(channel =>
                    channel.slice(start, end)
                );

                const audioFrame = new AudioData({
                    format: 'f32-planar',
                    sampleRate: this.audioBuffer.sampleRate,
                    numberOfFrames: length,
                    numberOfChannels: this.audioBuffer.numberOfChannels,
                    timestamp: (start / this.audioBuffer.sampleRate) * 1000000,
                    data: this.interleaveChannels(audioFrameData)
                });

                audioEncoder.encode(audioFrame);
                audioFrame.close();

                if (i % 100 === 0) {
                    const progress = 80 + ((i + 1) / totalAudioFrames) * 15;
                    this.updateProgress(progress, '音声をエンコード中...');
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }

            this.updateProgress(95, 'ファイナライズ中...');

            await videoEncoder.flush();
            await audioEncoder.flush();

            videoEncoder.close();
            audioEncoder.close();

            muxer.finalize();

            const { buffer } = muxer.target;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            this.downloadBtn.href = url;
            this.downloadLink.style.display = 'block';
            this.updateProgress(100, '完了！');
            this.generateBtn.disabled = false;

        } catch (error) {
            console.error('動画生成エラー:', error);
            alert('動画の生成に失敗しました: ' + error.message);
            this.generateBtn.disabled = false;
            this.progress.style.display = 'none';
        }
    }

    interleaveChannels(channelData) {
        const totalLength = channelData[0].length * channelData.length;
        const result = new Float32Array(totalLength);

        for (let i = 0; i < channelData[0].length; i++) {
            for (let ch = 0; ch < channelData.length; ch++) {
                result[i * channelData.length + ch] = channelData[ch][i];
            }
        }

        return result;
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
