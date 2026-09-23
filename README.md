# Vietflex Không Chạm

WebGIS điều khiển bằng một bàn tay qua camera. Ba góc nhìn dùng chung tâm: OpenStreetMap (Leaflet), Google Maps nhúng và Google Street View 360° nhúng. Google Earth mở ở tọa độ hiện tại trong tab riêng. Chế độ nhúng Google Maps / Street View được chuyển từ [Vietflexmap/xemduong](https://github.com/Vietflexmap/xemduong/blob/main/app.js); không nhập hoặc lưu API key, không tải Maps JavaScript API hay gọi backend của `xemduong`.

## Chạy local

Cần Node.js 22, Internet và quyền camera trên `localhost` hoặc HTTPS.

```bash
npm ci
npm run dev
```

Kiểm tra: `npm test && npm run build && npm run sync:root && npm run check:root`.

## Sử dụng

1. Mở trang: bản đồ OSM, Google Maps vệ tinh và Street View hiển thị cùng tọa độ ban đầu. Có thể dán cặp tọa độ hoặc liên kết Google Maps chứa tọa độ vào ô **Đi đến vị trí**. Liên kết rút gọn không chứa tọa độ không thể giải trực tiếp trong trình duyệt.
2. Kéo/thu phóng trên bản đồ OSM hoặc kéo/cuộn trên khung Google Maps để đổi tâm. Khung Google được điều khiển qua lớp kéo ở trang này, rồi hai iframe cập nhật sau khi dừng thao tác khoảng 0,85 giây. Đổi giữa bản đồ đường và vệ tinh bằng nút trong chân khung Google.
3. Bật camera. Đưa một bàn tay mở vào khung hình, giữ yên khoảng 0,7 giây để lấy mốc. Nắm tay và di chuyển để pan; chụm ngón trỏ và ngón cái (giữ các ngón còn lại mở), đưa tay lên/xuống để zoom. Mở tay để lấy mốc mới. Camera và mô hình nhận dạng xử lý trong trình duyệt, không gửi hình tới máy chủ Vietflex.
4. Dùng **Mở Google Maps**, **Mở Street View** hoặc **Google Earth** để xem tọa độ hiện tại trong tab khác. Liên kết Google Maps mang theo mức zoom, Earth dùng tìm kiếm tọa độ.

## Giới hạn của chế độ không API

Iframe Google Maps và Street View ở đây dùng các URL nhúng `output=embed` / `output=svembed` như mã nguồn `xemduong`. Đây là endpoint cũ, không phải giao diện Maps Embed API có hợp đồng ổn định; Google có thể thay đổi hoặc chặn hiển thị. Luôn có liên kết mở Google Maps và Street View ở vị trí tương ứng. Một số vị trí không có ảnh Street View.

Iframe chạy khác nguồn nên trang không thể đọc thao tác di chuyển *bên trong* ảnh Street View hay trạng thái Google Maps; chỉ thao tác qua bản đồ OSM và lớp điều khiển bên trên Google Maps mới cập nhật cả ba khung. Google Earth mở ngoài trang, không đồng bộ khi tiếp tục di chuyển và không điều khiển được độ cao/góc nhìn. Nhúng và đồng bộ hai chiều bằng API chính thức cần API key và dịch vụ Google tương ứng. Không dùng tile Google không chính thức hay proxy tile qua backend.

Cần Internet để tải OSM, Google, MediaPipe và phông chữ. Camera có đường dự phòng CPU nếu GPU không khả dụng; nếu quyền camera bị từ chối, bản đồ vẫn dùng bằng chuột/chạm.

## GitHub Pages

Nguồn HTML: `site/index.html`; TypeScript: `src/`. Build ra `dist/`. Root `index.html`, `assets/` và `favicon.svg` là bản build cho Pages nhánh `main / (root)`; sau sửa nguồn chạy `npm run build && npm run sync:root`, commit cả nguồn và tệp build. Workflow `.github/workflows/pages.yml` kiểm thử và triển khai `dist` bằng Actions. URL: https://vietflexmap.github.io/khongcham/.

Thư viện cử chỉ [`@map-gesture-controls/core`](https://github.com/sanderdesnaijer/map-gesture-controls), MIT; xem [thông báo bên thứ ba](THIRD_PARTY_NOTICES.md). Dữ liệu bản đồ © OpenStreetMap contributors; Google Maps và Street View © Google.
