# Vietflex Không Chạm

WebGIS dùng một bàn tay để điều khiển đồng thời OpenStreetMap (Leaflet) và Google Maps. Bộ phân loại cử chỉ sử dụng [`@map-gesture-controls/core`](https://github.com/sanderdesnaijer/map-gesture-controls) của Sander de Snaijer; camera dùng MediaPipe Tasks Vision có đường dự phòng CPU khi WebGL/GPU không khả dụng. Lớp điều khiển riêng ánh xạ nắm tay thành pan, chụm ngón + lên/xuống thành zoom. Google Maps nhúng dùng API chính thức. Camera chạy trong trình duyệt, không truyền khung hình đến máy chủ của dự án.

## Thử tại máy

Yêu cầu Node.js 22, camera và `localhost` (hoặc HTTPS):

```bash
npm ci
npm run dev
```

Kiểm tra: `npm test && npm run build`.

## Dùng bản đồ

1. Mở trang. Bản đồ OpenStreetMap hoạt động ngay khi có Internet.
2. Nhập **Maps JavaScript API key** vào khung Google để mở Google Maps dạng vệ tinh. Bật Maps JavaScript API và cấu hình HTTP referrer cho `https://vietflexmap.github.io/khongcham/*` trong Google Cloud. Google Maps Platform yêu cầu cấu hình thanh toán cho triển khai thực tế. Khóa ở giao diện chỉ giữ trong bộ nhớ tab, không gửi cho máy chủ Vietflex và không ghi vào repo; như mọi khóa API trên trình duyệt, nó hiển thị trong các yêu cầu tới Google nên **phải giới hạn tên miền và API**. Nếu chưa có khóa, dùng liên kết **Mở Google Maps vệ tinh** để mở đúng tâm và mức zoom hiện tại trong tab mới; tab ngoài không tự đồng bộ sau khi mở.
3. Bấm **Bật camera & bắt đầu**, cho phép camera. Lần đầu cần tải MediaPipe WASM và mô hình từ CDN. Nếu GPU không hoạt động, trang thử CPU. Khi không có camera hoặc từ chối quyền, trang báo lỗi dễ hiểu và bản đồ vẫn dùng chuột được.
4. Đưa **một** bàn tay vào khung và giữ bàn tay mở, yên khoảng 0,7 giây để lấy mốc. Nắm tay và di chuyển để pan; chụm ngón trỏ và ngón cái (giữ những ngón còn lại mở), đưa tay lên/xuống để phóng to/thu nhỏ. Mở bàn tay để lấy mốc mới. Khi tay ra khỏi khung hình, cần lấy mốc lại.
5. Không có camera, dùng chuột/bàn phím trên bản đồ OSM. Hai bản đồ đồng bộ tọa độ và mức zoom khi Google đã kết nối. Có thể kéo Google Maps để đồng bộ ngược lại. **Mở Google Earth** tìm cùng tọa độ trong tab khác; đường liên kết không điều khiển được camera/độ cao của Google Earth.

## GitHub Pages

Mã nguồn HTML nằm tại `site/index.html`; mã TypeScript nằm trong `src/`. Chạy `npm run build` để tạo `dist/`. Tệp `index.html`, `assets/` và `favicon.svg` ở gốc repo là bản build đã xuất, để Pages hoạt động cả khi nguồn phát hành đang chọn `main / (root)`; không sửa trực tiếp các tệp đã build này. Khi sửa mã nguồn, chạy `npm run build && npm run sync:root`, rồi commit các tệp tạo ra cùng mã nguồn. Workflow `.github/workflows/pages.yml` cũng kiểm thử, build và triển khai `dist` bằng GitHub Actions. Nên chọn **Settings → Pages → Build and deployment → Source: GitHub Actions** để chỉ có một luồng phát hành. URL: `https://vietflexmap.github.io/khongcham/`.

## Giới hạn

- Cần Internet để tải tile OpenStreetMap, Google Maps, MediaPipe và phông chữ. Không có chế độ offline.
- Không có Google key thì khung Google hiển thị màn hình kết nối thay vì bản đồ vệ tinh. Không dùng tile Google không chính thức.
- Cử chỉ có thể phụ thuộc góc camera và ánh sáng. Thao tác mở bàn tay lấy mốc giúp hạn chế rung và di chuyển nhầm.
- Google Earth được mở bằng liên kết tìm kiếm tọa độ. Không thể nhúng hoặc điều khiển trực tiếp Earth trong tab này bằng Maps JavaScript API.

Giấy phép thư viện cử chỉ: MIT, xem [thông báo bên thứ ba](THIRD_PARTY_NOTICES.md). Dữ liệu bản đồ © OpenStreetMap contributors; Google Maps © Google.
