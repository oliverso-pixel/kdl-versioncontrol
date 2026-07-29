import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-polylinedecorator";
import _ from "lodash";
import { Car } from 'lucide-react';
import { renderToString } from 'react-dom/server';

const DEFAULT_CENTER = [22.2807, 114.156];

const createCarIcon = (isEnd = false) => {
  const iconHtml = renderToString(
    <div className="icon-bg">
      <span className="icon-ping"></span>
      <div className={isEnd ? "icon-car-end" : "icon-car"}>
        <Car size={16} strokeWidth={2.5} />
      </div>
    </div>
  );

  return L.divIcon({
    html: iconHtml,
    className: '',            // 清空 Leaflet 預設白底方塊
    iconSize: [40, 40],       // 整體 icon 大小（包含呼吸燈）
    iconAnchor: [20, 20],     // 錨點設在正中間，對準座標
    popupAnchor: [0, -20],    // Popup 往上偏移，顯示在車子上方
  });
};

function arePointsClose(p1, p2, threshold = 20) { // threshold 單位: 公尺
  const latlng1 = L.latLng(p1.lat, p1.lng);
  const latlng2 = L.latLng(p2.lat, p2.lng);
  return latlng1.distanceTo(latlng2) <= threshold;
}

export default function LocationMap({ locationHistory = [], selectedDate }) {
  const carIconInstance = createCarIcon();

  const filteredHistory = useMemo(() => {
    if (!selectedDate || !Array.isArray(locationHistory)) return [];

    return locationHistory.filter(
      (loc) => new Date(loc.time).toDateString() === selectedDate.toDateString()
    );
  }, [locationHistory, selectedDate]);

  const startPoint = filteredHistory[0];
  const endPoint = filteredHistory[filteredHistory.length - 1];

  // 把相同座標的紀錄合併
  const groupedHistory = useMemo(() => {
    const groups = [];
    filteredHistory.forEach(point => {
      let foundGroup = groups.find(group =>
        arePointsClose(group[0], point, 20) // 20 公尺以內算同一組
      );
      if (foundGroup) {
        foundGroup.push(point);
      } else {
        groups.push([point]);
      }
    });
    return groups;
  }, [filteredHistory]);

  const route = useMemo(() => filteredHistory.map((loc) => [loc.lat, loc.lng]), [filteredHistory]);

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "100%", width: "100%" }} attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {/* 地圖標題 */}
      <div className="map-title" style={{ zIndex: 1000 }}>
        <span className="map-title-text">行車軌跡日期</span>
        {selectedDate && (
          <span className="map-title-date">
            {selectedDate.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })}
          </span>
        )}
      </div>

      {groupedHistory.map((group, idx) => {
        const { lat, lng } = group[0];
        return (
          <Marker key={idx} position={[lat, lng]} icon={group.includes(endPoint) ? createCarIcon(true) : createCarIcon(false)}>
            <Popup>
              <div className="popup-container">
                {group.map((item, i) => {
                  const orderIndex = filteredHistory.indexOf(item) + 1;
                  const isStart = item === startPoint;
                  const isEnd = item === endPoint;
                  return (
                    <div key={i} className="popup-item">
                      <div className="flex gap-1 mb-1">
                        <span className="popup-label-day">位置順序 {orderIndex}</span>
                        {isStart && <span className="popup-label-start">起點</span>}
                        {isEnd && <span className="popup-label-end">終點</span>}
                      </div>
                      <div><strong>電量:</strong> {item.battery}%</div>
                      <div><strong>時間:</strong> {new Date(item.time).toLocaleTimeString()}</div>
                    </div>
                  );
                })}
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* 軌跡折線 + 箭頭 */}
      <ArrowPolyline positions={route} />
      <FitBounds route={route} selectedDate={selectedDate} />
    </MapContainer>
  );
}

function FitBounds({ route, selectedDate }) {
  const map = useMap();
  const lastLocatedDateRef = useRef(null);
  const firstPointStringRef = useRef("");

  useEffect(() => {
    if (!route || route.length === 0) return;

    const currentDateString = selectedDate ? selectedDate.toDateString() : "";
    const currentFirstPointString = JSON.stringify(route[0]);

    const isDateChanged = lastLocatedDateRef.current !== currentDateString;
    const isFirstPointChanged = firstPointStringRef.current !== currentFirstPointString;

    if (isDateChanged || isFirstPointChanged) {
      const bounds = L.latLngBounds(route);
      if (route.length === 1) {
        map.setView(route[0], 15);
      } else {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
      lastLocatedDateRef.current = currentDateString;
      firstPointStringRef.current = currentFirstPointString;
    }
  }, [route, map, selectedDate]);

  return null;
}

const ArrowPolyline = ({ positions }) => {
  const map = useMap();

  useEffect(() => {
    if (!positions || positions.length <= 1) return;

    let polylineInstance = null;
    let decoratorInstance = null;
    let intervalId = null;
    let offset = 0;

    try {
      polylineInstance = L.polyline(positions, {
        color: "#1e40af",
        weight: 3,
        dashArray: "20",
      }).addTo(map);

      const createDecorator = (currentOffset) => {
        return L.polylineDecorator(polylineInstance, {
          patterns: [
            {
              offset: currentOffset,
              repeat: 100, // 箭頭之間的間距
              symbol: L.Symbol.arrowHead({
                pixelSize: 15,
                polygon: true, // 箭頭模式
                pathOptions: {
                  stroke: true,
                  color: "#f97316",     // 邊框顏色
                  weight: 1,
                  fill: true,          // 實心效果
                  fillColor: "#f97316", // 實心效果
                  fillOpacity: 1       // 實心不透明度
                }
              }),
            },
          ],
        }).addTo(map);
      };

      decoratorInstance = createDecorator(offset);

      // 每隔 300ms 更新 offset，讓線和箭頭流動
      intervalId = setInterval(() => {
        offset = (offset + 5) % 100;

        if (decoratorInstance && map.hasLayer(decoratorInstance)) {
          map.removeLayer(decoratorInstance);
        }
        polylineInstance.setStyle({ dashOffset: offset.toString() });

        decoratorInstance = createDecorator(offset);
      }, 300);

    } catch (error) {
      console.error("繪製動態實心箭頭失敗:", error);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (polylineInstance && map.hasLayer(polylineInstance)) {
        map.removeLayer(polylineInstance);
      }
      if (decoratorInstance && map.hasLayer(decoratorInstance)) {
        map.removeLayer(decoratorInstance);
      }
    };
  }, [positions, map]);

  return null;
};
