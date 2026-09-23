# Vietflex Không Chạm

WebGIS dùng một bàn tay để điều khiển đồng thời OpenStreetMap (Leaflet) và Google Maps. Bộ nhận diện bàn tay sử dụng [`@map-gesture-controls/core`](https://github.com/sanderdesnaijer/map-gesture-controls) của Sander de Snaijer; lớp điều khiển riêng ánh xạ nắm tay thành pan, chụm ngón + lên/xuống thành zoom. Google Maps dùng API chính thức. Camera chạy trong trình duyệt, không truyền khung hình đến máy chủ của dự án.

## Thử tại máy

Yêu cầu Node.js 22, camera và `localhost` (hoặc HTTPS):

```bash
npm ci
npm run dev
```

Kiểm tra: `npm test && npm run build`.

## Dùng bản đồ

1. Mở trang. Bản đồ OpenStreetMap hoạt động ngay khi có Internet.
2. Nhập **Maps JavaScript API key** vào khung Google để mở Google Maps dạng vệ tinh. Bật Maps JavaScript API và cấu hình HTTP referrer cho `https://vietflexmap.github.io/khongcham/*` trong Google Cloud. Google Maps Platform yêu cầu cấu hình thanh toán cho triển khai thực tế. Khóa ở giao diện chỉ giữ trong bộ nhớ tab, không gửi cho máy chủ Vietflex và không ghi vào repo; như mọi khóa API trên trình duyệt, nó hiển thị trong các yêu cầu tới Google nên **phải giới hạn tên miền và API**.
3. Bấm **Bật camera & bắt đầu**, cho phép camera. Lần đầu cần tải MediaPipe WASM và mô hình từ CDN được thư viện sử dụng.
4. Đưa **một** bàn tay vào khung và giữ bàn tay mở, yên khoảng 0,7 giây để lấy mốc. Nắm tay và di chuyển để pan; chụm ngón trỏ và ngón cái (giữ những ngón còn lại mở), đưa tay lên/xuống để phóng to/thu nhỏ. Mở bàn tay để lấy mốc mới. Khi tay ra khỏi khung hình, cần lấy mốc lại.
5. Không có camera, dùng chuột/bàn phím trên bản đồ OSM. Hai bản đồ đồng bộ tọa độ và mức zoom khi Google đã kết nối. Có thể kéo Google Maps để đồng bộ ngược lại. **Mở Google Earth** tìm cùng tọa độ trong tab khác; đường liên kết không điều khiển được camera/độ cao của Google Earth.

## GitHub Pages

Workflow `.github/workflows/pages.yml` kiểm thử, build và đưa thư mục `dist` lên Pages khi `main` thay đổi. Trong **Settings → Pages → Build and deployment → Source** chọn **GitHub Actions** để kích hoạt Pages cho repo lần đầu, sau đó chạy lại workflow nếu lần chạy đầu báo Pages chưa được bật. Trang dự kiến: `https://vietflexmap.github.io/khongcham/`. Vite dùng `base: '/khongcham/'` để asset hoạt động đúng trên project Pages.

## Giới hạn

- Cần Internet để tải tile OpenStreetMap, Google Maps, MediaPipe và phông chữ. Không có chế độ offline.
- Không có Google key thì khung Google hiển thị màn hình kết nối thay vì bản đồ vệ tinh. Không dùng tile Google không chính thức.
- Cử chỉ có thể phụ thuộc góc camera, ánh sáng và khả năng WebGL/GPU của thiết bị. Thao tác mở bàn tay lấy mốc giúp hạn chế rung và di chuyển nhầm.
- Google Earth được mở bằng liên kết tìm kiếm tọa độ. Không thể nhúng hoặc điều khiển trực tiếp Earth trong tab này bằng Maps JavaScript API.

Giấy phép thư viện cử chỉ: MIT, xem [thông báo bên thứ ba](THIRD_PARTY_NOTICES.md). Dữ liệu bản đồ © OpenStreetMap contributors; Google Maps © Google.
