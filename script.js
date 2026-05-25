// Khởi chạy các biểu tượng Lucide nếu thư viện có sẵn
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// Khai báo biến toàn cục
let map = null;
let routePolyline = null;
let startMarker = null;
let endMarker = null;

let compiledGpxData = "";
let exportFileName = "70mai_Trip.gpx";

// DOM Elements
const uploadState = document.getElementById('uploadState');
const processingState = document.getElementById('processingState');
const successState = document.getElementById('successState');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

const outputFileName = document.getElementById('outputFileName');
const outputPointsCount = document.getElementById('outputPointsCount');
const routeGeoArea = document.getElementById('routeGeoArea');
const mapWrapper = document.getElementById('mapWrapper');
const offlineMapNotice = document.getElementById('offlineMapNotice');

const statPoints = document.getElementById('statPoints');
const statDistance = document.getElementById('statDistance');
const statElevation = document.getElementById('statElevation');

const btnDownload = document.getElementById('btnDownload');
const btnReset = document.getElementById('btnReset');

const errorModal = document.getElementById('errorModal');
const errorMessageText = document.getElementById('errorMessageText');
const closeErrorBtn = document.getElementById('closeErrorBtn');

// ĐỒNG BỘ TRẠNG THÁI MẠNG ĐỂ CẬP NHẬT GIAO DIỆN CHUẨN XÁC
function updateNetworkStatus() {
    const indicator = document.getElementById('networkIndicator');
    const dot = document.getElementById('networkDot');
    const text = document.getElementById('networkText');
    
    if (!indicator || !dot || !text) return;

    if (navigator.onLine) {
        indicator.className = "network-indicator network-online";
        text.textContent = "Đang trực tuyến";
    } else {
        indicator.className = "network-indicator network-offline";
        text.textContent = "Không có mạng (Ngoại tuyến)";
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();

// Hiển thị thông báo lỗi tùy biến (Không dùng alert)
function showError(message) {
    if (errorMessageText) errorMessageText.textContent = message;
    if (errorModal) errorModal.classList.remove('hidden');
    resetScreenState();
}

if (closeErrorBtn) {
    closeErrorBtn.addEventListener('click', () => {
        if (errorModal) errorModal.classList.add('hidden');
    });
}

// Tự động thay đổi giao diện theo thời gian thực tế (Ban đêm: 18h tối đến 6h sáng)
function applyAutomaticTheme() {
    try {
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 18 || currentHour < 6;
        const docEl = document.documentElement;
        const themeBadge = document.getElementById('themeBadge');

        if (isNight) {
            docEl.classList.add('dark');
            if (themeBadge) themeBadge.textContent = "Giao diện Tối";
        } else {
            docEl.classList.remove('dark');
            if (themeBadge) themeBadge.textContent = "Giao diện Sáng";
        }
    } catch (err) {
        console.error("Lỗi đổi theme:", err);
    }
}

applyAutomaticTheme();
setInterval(applyAutomaticTheme, 60000);

// Sự kiện bấm chọn file
if (dropZone) {
    dropZone.addEventListener('click', () => {
        if (fileInput) fileInput.click();
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importFile(e.target.files[0]);
        }
    });
}

// Các sự kiện hỗ trợ kéo thả tệp
if (dropZone) {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#ff6b00";
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = "";
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "";
        if (e.dataTransfer.files.length > 0) {
            importFile(e.dataTransfer.files[0]);
        }
    });
}

// Đọc tệp tin đầu vào
function importFile(file) {
    if (uploadState) uploadState.classList.add('hidden');
    if (processingState) processingState.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(event) {
        setTimeout(() => {
            convert70maiToGpx(event.target.result, file.name);
        }, 200);
    };
    reader.onerror = function() {
        showError("Không thể đọc tệp tin từ thiết bị của bạn. Vui lòng kiểm tra lại!");
    };
    reader.readAsText(file);
}

// Khởi tạo bản đồ vệ tinh Google Maps (Chỉ nạp khi TRỰC TUYẾN)
function initGoogleSatelliteMap(centerLat, centerLon) {
    try {
        if (navigator.onLine && typeof L !== 'undefined') {
            if (!map) {
                map = L.map('map', {
                    zoomControl: true,
                    scrollWheelZoom: true
                }).setView([centerLat, centerLon], 15);

                // Lớp bản đồ vệ tinh Google Hybrid
                L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['0', '1', '2', '3'],
                    attribution: '&copy; Google Maps'
                }).addTo(map);
            } else {
                map.setView([centerLat, centerLon], 15);
            }
            return true;
        }
    } catch (err) {
        console.error("Lỗi nạp bản đồ:", err);
    }
    return false;
}

// Phân tích định dạng dữ liệu GPS 70mai và chuyển đổi
function convert70maiToGpx(fileContent, name) {
    try {
        const lines = fileContent.split('\n');
        const points = [];
        let totalElevationSum = 0;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('$')) return;

            const parts = trimmed.split(',');
            if (parts.length >= 9) {
                const timestampRaw = parts[0].trim();
                const latVal = parseFloat(parts[2].trim());
                const lonVal = parseFloat(parts[3].trim());
                const eleVal = parseFloat(parts[8].trim());

                // Đảm bảo tọa độ hợp lệ, bảo toàn 100% dữ liệu kể cả sóng yếu V
                if (!isNaN(latVal) && !isNaN(lonVal) && latVal !== 0 && lonVal !== 0) {
                    let pointTime = null;
                    const unixSeconds = parseInt(timestampRaw);
                    
                    if (!isNaN(unixSeconds)) {
                        let timeMs = unixSeconds;
                        if (unixSeconds < 10000000000) {
                            timeMs *= 1000;
                        }
                        const tempDate = new Date(timeMs);
                        if (!isNaN(tempDate.getTime())) {
                            pointTime = tempDate;
                        }
                    }

                    const validElevation = !isNaN(eleVal) ? eleVal : 0;
                    totalElevationSum += validElevation;

                    points.push({
                        lat: latVal,
                        lon: lonVal,
                        ele: validElevation,
                        time: pointTime
                    });
                }
            }
        });

        if (points.length === 0) {
            showError("Tệp tin này không chứa dữ liệu tọa độ 70mai hợp lệ. Vui lòng kiểm tra lại!");
            return;
        }

        // Sắp xếp tăng dần theo mốc thời gian hành trình
        points.sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time - b.time;
        });

        // Thiết lập tên file gpx tải về
        const cleanBaseName = name.substring(0, name.lastIndexOf('.')) || name;
        exportFileName = `${cleanBaseName}.gpx`;

        // Tạo XML GPX 1.1 chuẩn quốc tế
        compiledGpxData = generateStandardGpxXml(cleanBaseName, points);

        // Tính toán tổng quãng đường di chuyển (Haversine)
        let totalDistanceMeters = 0;
        for (let i = 1; i < points.length; i++) {
            totalDistanceMeters += haversineDistance(
                points[i - 1].lat, points[i - 1].lon,
                points[i].lat, points[i].lon
            );
        }
        const totalDistanceKm = totalDistanceMeters / 1000;

        // Cập nhật các trường dữ liệu thống kê
        if (statPoints) statPoints.textContent = points.length.toLocaleString();
        if (statDistance) statDistance.textContent = totalDistanceKm.toFixed(2) + " km";
        
        const averageElevation = totalElevationSum / points.length;
        if (statElevation) statElevation.textContent = Math.round(averageElevation) + " m";

        // Đổi giao diện sang thành công
        if (outputFileName) outputFileName.textContent = exportFileName;
        if (outputPointsCount) outputPointsCount.textContent = `Đã chuyển đổi thành công ${points.length.toLocaleString()} tọa độ hành trình!`;

        if (processingState) processingState.classList.add('hidden');
        if (successState) successState.classList.remove('hidden');

        // HIỂN THỊ HOẶC ẨN BẢN ĐỒ TÙY THEO KẾT NỐI MẠNG THỰC TẾ
        if (navigator.onLine && typeof L !== 'undefined') {
            if (mapWrapper) mapWrapper.classList.remove('hidden');
            if (offlineMapNotice) offlineMapNotice.classList.add('hidden');
            
            const midIndex = Math.floor(points.length / 2);
            initGoogleSatelliteMap(points[midIndex].lat, points[midIndex].lon);
            renderRouteOnGoogleMap(points);

            setTimeout(() => {
                if (map) {
                    map.invalidateSize();
                }
            }, 200);
        } else {
            // NẾU MẤT MẠNG: Ẩn bản đồ an toàn để tránh sập JS
            if (mapWrapper) mapWrapper.classList.add('hidden');
            if (offlineMapNotice) offlineMapNotice.classList.remove('hidden');
        }

        // Dự đoán vị trí địa lý sơ bộ
        const firstPt = points[0];
        if (routeGeoArea) {
            if (firstPt.lat > 21.4 && firstPt.lat < 22.2 && firstPt.lon > 105.5 && firstPt.lon < 106.3) {
                routeGeoArea.textContent = "Thái Nguyên, Việt Nam";
            } else if (firstPt.lat > 20 && firstPt.lat < 22.5) {
                routeGeoArea.textContent = "Khu vực Bắc Bộ";
            } else if (firstPt.lat > 15 && firstPt.lat <= 20) {
                routeGeoArea.textContent = "Khu vực Trung Bộ";
            } else if (firstPt.lat > 8 && firstPt.lat <= 15) {
                routeGeoArea.textContent = "Khu vực Nam Bộ";
            } else {
                routeGeoArea.textContent = "Ngoài Lãnh Thổ VN";
            }
        }

        // TỰ ĐỘNG TẢI FILE GPX VỀ MÁY NGAY SAU KHI XONG (Kể cả khi ngoại tuyến)
        triggerGpxDownload();

    } catch (err) {
        console.error("Lỗi phân tích:", err);
        showError("Sự cố bất ngờ khi xử lý dữ liệu: " + err.message);
    }
}

// Vẽ đường tuyến màu cam dạ quang lên bản đồ Google vệ tinh
function renderRouteOnGoogleMap(points) {
    try {
        if (typeof L === 'undefined' || !map) return;

        if (routePolyline) map.removeLayer(routePolyline);
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);

        const pathCoords = points.map(p => [p.lat, p.lon]);

        routePolyline = L.polyline(pathCoords, {
            color: '#ff6b00',
            weight: 5.5,
            opacity: 0.9,
            lineJoin: 'round'
        }).addTo(map);

        const startIcon = L.divIcon({
            html: '<div style="width: 16px; height: 16px; background-color: #10b981; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>',
            className: 'custom-start-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const endIcon = L.divIcon({
            html: '<div style="width: 16px; height: 16px; background-color: #ef4444; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>',
            className: 'custom-end-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const startPoint = pathCoords[0];
        const endPoint = pathCoords[pathCoords.length - 1];

        startMarker = L.marker(startPoint, { icon: startIcon }).addTo(map);
        endMarker = L.marker(endPoint, { icon: endIcon }).addTo(map);

        setTimeout(() => {
            if (map && routePolyline) {
                map.fitBounds(routePolyline.getBounds(), { padding: [35, 35] });
            }
        }, 100);
    } catch (err) {
        console.error("Lỗi vẽ lộ trình:", err);
    }
}

// Công thức tính Haversine
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // mét
    const rLat1 = lat1 * Math.PI / 180;
    const rLat2 = lat2 * Math.PI / 180;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(rLat1) * Math.cos(rLat2) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
}

// Tạo chuỗi XML GPX 1.1 chuẩn quốc tế
function generateStandardGpxXml(name, points) {
    const timeNow = new Date().toISOString();
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="70mai A500S Satellite Converter" 
     xmlns="http://www.topografix.com/GPX/1/1" 
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <desc>Hành trình trích xuất từ tệp tin GPS nguyên bản của Camera 70mai A500S.</desc>
    <time>${timeNow}</time>
  </metadata>
  <trk>
    <name>Hành trình 70mai - ${name}</name>
    <trkseg>`;

    points.forEach(p => {
        const timeString = (p.time && !isNaN(p.time.getTime())) ? `\n        <time>${p.time.toISOString()}</time>` : '';
        gpx += `\n      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">
        <ele>${p.ele}</ele>${timeString}
      </trkpt>`;
    });

    gpx += `
    </trkseg>
  </trk>
</gpx>`;
    return gpx;
}

// Tải file .GPX xuống máy tính
function triggerGpxDownload() {
    try {
        if (!compiledGpxData) return;

        const blob = new Blob([compiledGpxData], { type: 'application/gpx+xml;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = exportFileName;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Lỗi khi tải file:", err);
    }
}

if (btnDownload) {
    btnDownload.addEventListener('click', triggerGpxDownload);
}

// Đưa màn hình về trạng thái sẵn sàng ban đầu
if (btnReset) {
    btnReset.addEventListener('click', resetScreenState);
}

function resetScreenState() {
    if (fileInput) fileInput.value = '';
    compiledGpxData = "";
    if (successState) successState.classList.add('hidden');
    if (processingState) processingState.classList.add('hidden');
    if (uploadState) uploadState.classList.remove('hidden');
}
