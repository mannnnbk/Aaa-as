// Khởi động các Icon Lucide
lucide.createIcons();

// Khai báo các biến toàn cục
let map;
let routePolyline;
let startMarker;
let endMarker;

let compiledGpxData = "";
let exportFileName = "70mai_Trip.gpx";

// Elements điều phối giao diện
const uploadState = document.getElementById('uploadState');
const processingState = document.getElementById('processingState');
const successState = document.getElementById('successState');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

const outputFileName = document.getElementById('outputFileName');
const outputPointsCount = document.getElementById('outputPointsCount');
const routeGeoArea = document.getElementById('routeGeoArea');

const statPoints = document.getElementById('statPoints');
const statDistance = document.getElementById('statDistance');
const statElevation = document.getElementById('statElevation');

const btnDownload = document.getElementById('btnDownload');
const btnReset = document.getElementById('btnReset');

// Custom Error Modal Elements
const errorModal = document.getElementById('errorModal');
const errorMessageText = document.getElementById('errorMessageText');
const closeErrorBtn = document.getElementById('closeErrorBtn');

// Hiển thị thông báo lỗi tùy biến
function showError(message) {
    errorMessageText.textContent = message;
    errorModal.classList.remove('hidden');
    resetScreenState();
}

closeErrorBtn.addEventListener('click', () => {
    errorModal.classList.add('hidden');
});

// Tự động thay đổi giao diện theo thời gian thực tế
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
setInterval(applyAutomaticTheme, 60000); // Cập nhật sau mỗi phút

// Sự kiện click chọn file
dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        importFile(e.target.files[0]);
    }
});

// Thao tác kéo thả file
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-brand', 'bg-brand/5');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-brand', 'bg-brand/5');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-brand', 'bg-brand/5');
    if (e.dataTransfer.files.length > 0) {
        importFile(e.dataTransfer.files[0]);
    }
});

// Đọc tệp tin đầu vào
function importFile(file) {
    uploadState.classList.add('hidden');
    processingState.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = function(event) {
        setTimeout(() => {
            // Cache lại file vào localStorage
            try {
                localStorage.setItem('cached_70mai_name', file.name);
                localStorage.setItem('cached_70mai_content', event.target.result);
            } catch (err) {
                console.warn("Không thể lưu cache vì file có dung lượng quá lớn:", err);
            }
            convert70maiToGpx(event.target.result, file.name);
        }, 300);
    };
    reader.onerror = function() {
        showError("Không thể đọc tệp tin từ thiết bị của bạn. Hãy thử lại!");
    };
    reader.readAsText(file);
}

// Khởi tạo bản đồ vệ tinh Google Maps
function initGoogleSatelliteMap(centerLat, centerLon) {
    try {
        if (!map) {
            map = L.map('map', {
                zoomControl: true,
                scrollWheelZoom: true
            }).setView([centerLat, centerLon], 15);

            // TileLayer Google Satellite Hybrid
            L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['0', '1', '2', '3'],
                attribution: '&copy; Google Maps'
            }).addTo(map);
        } else {
            map.setView([centerLat, centerLon], 15);
        }
    } catch (err) {
        console.error("Lỗi nạp bản đồ:", err);
    }
}

// Phân tích định dạng GPS 70mai và chuyển đổi
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
                const eleVal = parseFloat(parts[8].trim()); // Cột cao độ (index 8)

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
            showError("Không tìm thấy dữ liệu tọa độ GPS hợp lệ. Vui lòng kiểm tra lại cấu trúc file!");
            return;
        }

        // Sắp xếp tăng dần theo mốc thời gian hành trình
        points.sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time - b.time;
        });

        const cleanBaseName = name.substring(0, name.lastIndexOf('.')) || name;
        exportFileName = `${cleanBaseName}.gpx`;

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

        if (statPoints) statPoints.textContent = points.length.toLocaleString();
        if (statDistance) statDistance.textContent = totalDistanceKm.toFixed(2) + " km";
        
        const averageElevation = totalElevationSum / points.length;
        if (statElevation) statElevation.textContent = Math.round(averageElevation) + " m";

        if (outputFileName) outputFileName.textContent = exportFileName;
        if (outputPointsCount) outputPointsCount.textContent = `Chuyển đổi thành công ${points.length.toLocaleString()} tọa độ hành trình!`;

        processingState.classList.add('hidden');
        successState.classList.remove('hidden');

        const midIndex = Math.floor(points.length / 2);
        initGoogleSatelliteMap(points[midIndex].lat, points[midIndex].lon);
        renderRouteOnGoogleMap(points);

        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 200);

        // Tự động đoán vùng khu vực
        const firstPt = points[0];
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

        triggerGpxDownload();

    } catch (err) {
        console.error("Lỗi phân tích:", err);
        showError("Sự cố bất ngờ khi xử lý dữ liệu: " + err.message);
    }
}

// Vẽ đường tuyến lên Google vệ tinh
function renderRouteOnGoogleMap(points) {
    try {
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
            html: '<div class="w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-lg ring-4 ring-emerald-500/35"></div>',
            className: 'custom-start-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const endIcon = L.divIcon({
            html: '<div class="w-4 h-4 bg-rose-500 border-2 border-white rounded-full shadow-lg ring-4 ring-rose-500/35 animate-pulse"></div>',
            className: 'custom-end-marker',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        const startPoint = pathCoords[0];
        const endPoint = pathCoords[pathCoords.length - 1];

        startMarker = L.marker(startPoint, { icon: startIcon }).addTo(map)
            .bindPopup('<b class="text-slate-850">Điểm Đi</b>');

        endMarker = L.marker(endPoint, { icon: endIcon }).addTo(map)
            .bindPopup('<b class="text-slate-850">Điểm Đến</b>');

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

btnDownload.addEventListener('click', triggerGpxDownload);

// Reset trạng thái
btnReset.addEventListener('click', () => {
    localStorage.removeItem('cached_70mai_name');
    localStorage.removeItem('cached_70mai_content');
    resetScreenState();
});

function resetScreenState() {
    fileInput.value = '';
    compiledGpxData = "";
    successState.classList.add('hidden');
    processingState.classList.add('hidden');
    uploadState.classList.remove('hidden');
}

// KHÔI PHỤC FILE GẦN NHẤT ĐÃ LƯU TRÊN BỘ NHỚ TRÌNH DUYỆT (Nếu có)
window.addEventListener('DOMContentLoaded', () => {
    const cachedName = localStorage.getItem('cached_70mai_name');
    const cachedContent = localStorage.getItem('cached_70mai_content');
    if (cachedName && cachedContent) {
        uploadState.classList.add('hidden');
        processingState.classList.remove('hidden');
        setTimeout(() => {
            convert70maiToGpx(cachedContent, cachedName);
        }, 300);
    }
});
