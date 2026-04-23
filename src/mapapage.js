import { useState, useEffect, useRef } from "react";

const C = {
  bg:"#0a0f0a", surface:"#0f1a0f", card:"#111d11",
  border:"#1e3a1e", borderLight:"#2a4f2a",
  green1:"#0d5c2e", green2:"#12803f", green3:"#16a34a",
  accent:"#22c55e", accentBright:"#4ade80",
  text:"#e8f5e9", textMuted:"#6b9e6b", textDim:"#3d6b3d",
  yellow:"#fbbf24", red:"#ef4444", orange:"#f97316", blue:"#3b82f6",
};

const CAMADAS = [
  { id:"car",     label:"Polígono CAR",      icon:"🌿", color:"#22c55e", ativa:true  },
  { id:"sigef",   label:"SIGEF/INCRA",       icon:"🗂️", color:"#3b82f6", ativa:true  },
  { id:"app",     label:"APP",               icon:"💧", color:"#60a5fa", ativa:true  },
  { id:"rl",      label:"Reserva Legal",     icon:"🌱", color:"#4ade80", ativa:true  },
  { id:"ibama",   label:"Embargos IBAMA",    icon:"⛔", color:"#ef4444", ativa:false },
  { id:"prodes",  label:"PRODES/INPE",       icon:"📡", color:"#f97316", ativa:false },
  { id:"cerrado", label:"Moratória Cerrado", icon:"🏜️", color:"#fbbf24", ativa:false },
  { id:"relevo",  label:"Relevo/Topografia", icon:"🏔️", color:"#a78bfa", ativa:false },
];

const FAZENDA_MOCK = {
  nome: "Fazenda Horizonte Verde",
  car: "MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",
  municipio: "Sinop, MT",
  area: "1.284,7 ha",
  ccir: "800.429.7412-9",
  itr: "R$ 2.847,00/ano",
  situacao: "Regular",
  proprietario: "Agropecuária Horizonte Ltda.",
  modulos: "42,8 módulos fiscais",
  sigef: "Certificado",
  app: "183,4 ha (14,3%)",
  rl: "399,8 ha (31,1%)",
  coordenadas: { lat: -11.8456, lng: -55.1987 },
  embargo: false,
  prodes: false,
};

export default function MapaPage() {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const [camadas, setCamadas] = useState(CAMADAS);
  const [tipoMapa, setTipoMapa] = useState("satellite");
  const [fazenda] = useState(FAZENDA_MOCK);
  const [kmlNome, setKmlNome] = useState(null);
  const [searchVal, setSearchVal] = useState("");
  const [painelAberto, setPainelAberto] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (leafletMap.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => initMap();
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapRef.current || leafletMap.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      center: [FAZENDA_MOCK.coordenadas.lat, FAZENDA_MOCK.coordenadas.lng],
      zoom: 13,
      zoomControl: false,
    });

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { attribution: "© Esri", maxZoom: 19 }
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const lat = FAZENDA_MOCK.coordenadas.lat;
    const lng = FAZENDA_MOCK.coordenadas.lng;
    const offset = 0.05;

    const poligono = L.polygon([
      [lat + offset,     lng - offset * 0.5],
      [lat + offset,     lng + offset],
      [lat,              lng + offset * 1.5],
      [lat - offset,     lng + offset],
      [lat - offset,     lng - offset * 0.5],
      [lat,              lng - offset * 1.2],
    ], { color:"#22c55e", weight:3, fillColor:"#22c55e", fillOpacity:0.15 }).addTo(map);

    L.polygon([
      [lat + offset * 0.3, lng - offset * 0.3],
      [lat + offset * 0.5, lng + offset * 0.3],
      [lat + offset * 0.2, lng + offset * 0.6],
      [lat,                lng + offset * 0.4],
      [lat - offset * 0.1, lng],
    ], { color:"#60a5fa", weight:2, fillColor:"#60a5fa", fillOpacity:0.2, dashArray:"5,5" }).addTo(map);

    L.polygon([
      [lat - offset * 0.2, lng - offset * 0.4],
      [lat - offset * 0.1, lng + offset * 0.1],
      [lat - offset * 0.4, lng + offset * 0.2],
      [lat - offset * 0.5, lng - offset * 0.2],
    ], { color:"#4ade80", weight:2, fillColor:"#4ade80", fillOpacity:0.25, dashArray:"8,4" }).addTo(map);

    const icon = L.divIcon({
      html: `<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`,
      iconSize: [36, 36], iconAnchor: [18, 36], className: "",
    });

    const marker = L.marker([lat, lng], { icon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:sans-serif;min-width:200px">
        <div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:4px">🌿 ${FAZENDA_MOCK.nome}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">📍 ${FAZENDA_MOCK.municipio}</div>
        <div style="font-size:12px;color:#666;margin-bottom:4px">🌾 Área: ${FAZENDA_MOCK.area}</div>
        <div style="font-size:12px;color:#666">📋 CAR: ${FAZENDA_MOCK.car.substring(0,20)}...</div>
        <hr style="margin:8px 0;border-color:#eee"/>
        <div style="font-size:11px;color:#22c55e;font-weight:700">✅ Situação Regular</div>
      </div>
    `);

    leafletMap.current = map;
    map.fitBounds(poligono.getBounds(), { padding: [40, 40] });
  };

  const trocarMapa = (tipo) => {
    if (!leafletMap.current || !window.L) return;
    const map = leafletMap.current;
    const L = window.L;
    Object.values(map._layers).forEach(layer => { if (layer._url) map.removeLayer(layer); });
    if (tipo === "satellite") {
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom:19 }).addTo(map);
    } else if (tipo === "mapa") {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19 }).addTo(map);
    } else if (tipo === "terreno") {
      L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png", { maxZoom:18 }).addTo(map);
    }
    setTipoMapa(tipo);
  };

  const toggleCamada = (id) => {
    setCamadas(prev => prev.map(c => c.id === id ? { ...c, ativa: !c.ativa } : c));
  };

  const importarKML = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setKmlNome(file.name);
    alert(`✅ KML "${file.name}" importado!`);
  };

  const exportarKML = () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${fazenda.nome}</name>
    <Placemark>
      <name>${fazenda.nome}</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        ${fazenda.coordenadas.lng - 0.05},${fazenda.coordenadas.lat + 0.05},0
        ${fazenda.coordenadas.lng + 0.05},${fazenda.coordenadas.lat + 0.05},0
        ${fazenda.coordenadas.lng + 0.075},${fazenda.coordenadas.lat},0
        ${fazenda.coordenadas.lng + 0.05},${fazenda.coordenadas.lat - 0.05},0
        ${fazenda.coordenadas.lng - 0.025},${fazenda.coordenadas.lat - 0.05},0
        ${fazenda.coordenadas.lng - 0.06},${fazenda.coordenadas.lat},0
        ${fazenda.coordenadas.lng - 0.05},${fazenda.coordenadas.lat + 0.05},0
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Document>
</kml>`;
    const blob = new Blob([kml], { type:"application/vnd.google-earth.kml+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${fazenda.nome.replace(/ /g,"_")}.kml`; a.click();
    URL.revokeObjectURL(url);
  };

  const centralizarMapa = () => {
    if (!leafletMap.current) return;
    leafletMap.current.setView([fazenda.coordenadas.lat, fazenda.coordenadas.lng], 13);
  };

  const chip = (txt, color) => (
    <span style={{ display:"inline-flex", alignItems:"center", fontSize:11, fontWeight:600, padding:"3px 9px", borderRadius:20, background:`${color}20`, color, border:`1px solid ${color}30` }}>
      {txt}
    </span>
  );

  return (
    <div className="mapa-container" style={{ display:"flex", height:"calc(100vh - 64px)", overflow:"hidden" }}>
      <style>{`
        /* ── MOBILE ── */
        @media (max-width: 768px) {
          .mapa-container {
            flex-direction: column !important;
            height: auto !important;
            min-height: calc(100vh - 64px);
            overflow-y: auto !important;
          }
          .mapa-painel-esq {
            width: 100% !important;
            max-height: none !important;
            border-right: none !important;
            border-bottom: 1px solid #1e3a1e !important;
            flex-shrink: 0 !important;
          }
          .mapa-centro {
            width: 100% !important;
            height: 70vw !important;
            min-height: 280px !important;
            max-height: 420px !important;
            flex: none !important;
          }
          .mapa-painel-dir {
            display: none !important;
          }
          .mapa-toolbar-camadas {
            display: none !important;
          }
          .mapa-toolbar {
            padding: 6px 8px !important;
            gap: 6px !important;
            flex-wrap: wrap !important;
          }
          .mapa-score {
            top: auto !important;
            bottom: 50px !important;
            right: 8px !important;
            padding: 8px 10px !important;
          }
          .mapa-status {
            top: auto !important;
            bottom: 50px !important;
            left: 8px !important;
            padding: 8px 10px !important;
          }
          .mapa-legenda {
            bottom: 8px !important;
            left: 8px !important;
            padding: 8px 10px !important;
          }
        }
      `}</style>

      {/* PAINEL ESQUERDO */}
      <div className="mapa-painel-esq" style={{ width:280, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>

        {/* Busca */}
        <div style={{ padding:"14px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, marginBottom:8 }}>🔍 Buscar Imóvel</div>
          <div style={{ display:"flex", gap:6 }}>
            <input
              style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:12, outline:"none" }}
              placeholder="CAR, GPS ou endereço..."
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
            />
            <button style={{ background:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", borderRadius:8, color:C.text, width:34, cursor:"pointer", fontSize:14, flexShrink:0 }}>🔍</button>
          </div>
        </div>

        {/* Info fazenda */}
        <div style={{ padding:"14px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>📋 Dados do Imóvel</div>
            {chip("✓ Regular", C.accent)}
          </div>
          <div style={{ fontSize:13, fontWeight:800, color:C.accentBright, marginBottom:4 }}>{fazenda.nome}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginBottom:10 }}>📍 {fazenda.municipio}</div>

          {[
            ["🌾 Área Total",     fazenda.area],
            ["📋 CAR",           fazenda.car.substring(0,18)+"..."],
            ["📄 CCIR",          fazenda.ccir],
            ["💰 ITR",           fazenda.itr],
            ["👤 Proprietário",  fazenda.proprietario.substring(0,22)+"..."],
            ["📐 Módulos Fiscais",fazenda.modulos],
            ["🗂️ SIGEF",         fazenda.sigef],
            ["💧 Aplicativo",    fazenda.app],
            ["🌱 Reserva Legal", fazenda.rl],
          ].map(([l, v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
              <span style={{ color:C.textMuted }}>{l}</span>
              <span style={{ fontWeight:600, color:C.text, textAlign:"right", maxWidth:130 }}>{v}</span>
            </div>
          ))}

          <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
            {chip("⛔ Sem Embargo", C.accent)}
            {chip("📡 Sem Alerta PRODES", C.accent)}
          </div>
        </div>

        {/* Coordenadas */}
        <div style={{ padding:"14px", borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>📍 Coordenadas</div>
          {[["Latitude", `${fazenda.coordenadas.lat}°`], ["Longitude", `${fazenda.coordenadas.lng}°`]].map(([l,v]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:11, borderBottom:`1px solid ${C.border}` }}>
              <span style={{ color:C.textMuted }}>{l}</span>
              <span style={{ fontWeight:600 }}>{v}</span>
            </div>
          ))}
          <button onClick={centralizarMapa} style={{ marginTop:8, width:"100%", padding:"7px 0", borderRadius:8, background:`${C.green1}60`, border:`1px solid ${C.borderLight}`, color:C.accentBright, fontSize:11, fontWeight:600, cursor:"pointer" }}>
            🎯 Centralizar no Mapa
          </button>
        </div>

        {/* Ações */}
        <div style={{ padding:"14px" }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>⚡ Ações</div>
          <input type="file" accept=".kml,.kmz" ref={fileRef} style={{ display:"none" }} onChange={importarKML} />
          {[
            ["📥 Importar KML",    () => fileRef.current?.click(), C.blue],
            ["📤 Exportar KML",    exportarKML,                    C.accent],
            ["📄 Gerar Laudo PDF", () => alert("Em breve!"),       C.yellow],
            ["💬 Enviar WhatsApp", () => alert("Em breve!"),       C.accentBright],
          ].map(([l, fn, c]) => (
            <button key={l} onClick={fn} style={{ display:"block", width:"100%", marginBottom:7, padding:"8px 12px", borderRadius:8, textAlign:"left", background:`${c}15`, border:`1px solid ${c}40`, color:c, fontWeight:600, fontSize:11.5, cursor:"pointer" }}>
              {l}
            </button>
          ))}
          {kmlNome && <div style={{ fontSize:11, color:C.accent, marginTop:4 }}>✅ KML: {kmlNome}</div>}
        </div>
      </div>

      {/* MAPA + CONTROLES */}
      <div className="mapa-centro" style={{ flex:1, position:"relative", display:"flex", flexDirection:"column", minWidth:0 }}>

        {/* Toolbar */}
        <div className="mapa-toolbar" style={{ background:`${C.surface}f0`, backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, padding:"8px 14px", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
          <div style={{ display:"flex", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:3, gap:2 }}>
            {[["satellite","🛰️ Satélite"],["mapa","🗺️ Mapa"],["terreno","🏔️ Terreno"]].map(([k,l]) => (
              <button key={k} onClick={() => trocarMapa(k)} style={{ padding:"5px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:tipoMapa===k?700:400, background:tipoMapa===k?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent", color:tipoMapa===k?C.text:C.textMuted }}>
                {l}
              </button>
            ))}
          </div>

          <div className="mapa-toolbar-camadas" style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {camadas.slice(0,5).map(c => (
              <button key={c.id} onClick={() => toggleCamada(c.id)} style={{ padding:"4px 9px", borderRadius:20, border:`1px solid ${c.ativa ? c.color+"60" : C.border}`, background:c.ativa ? `${c.color}20` : "transparent", color:c.ativa ? c.color : C.textDim, fontSize:11, fontWeight:c.ativa?600:400, cursor:"pointer" }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
            <button onClick={() => fileRef.current?.click()} style={{ padding:"5px 10px", borderRadius:8, background:C.card, border:`1px solid ${C.border}`, color:C.accentBright, fontSize:11, fontWeight:600, cursor:"pointer" }}>📥 KML</button>
            <button onClick={exportarKML} style={{ padding:"5px 10px", borderRadius:8, background:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", color:C.text, fontSize:11, fontWeight:600, cursor:"pointer" }}>📤 Exportar</button>
          </div>
        </div>

        {/* Mapa */}
        <div ref={mapRef} style={{ flex:1, background:`linear-gradient(135deg,${C.bg},#0d2010)` }} />

        {/* Legenda */}
        <div className="mapa-legenda" style={{ position:"absolute", bottom:40, left:16, background:`${C.surface}f0`, backdropFilter:"blur(12px)", border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 12px", zIndex:1000 }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.textMuted, marginBottom:6, textTransform:"uppercase" }}>Legenda</div>
          {camadas.filter(c=>c.ativa).map(c => (
            <div key={c.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, fontSize:11 }}>
              <div style={{ width:16, height:4, borderRadius:2, background:c.color, flexShrink:0 }} />
              <span style={{ color:C.textMuted }}>{c.label}</span>
            </div>
          ))}
        </div>

        {/* Score */}
        <div className="mapa-score" style={{ position:"absolute", top:70, right:16, background:`${C.surface}f0`, backdropFilter:"blur(12px)", border:`1px solid ${C.border}`, borderRadius:12, padding:"12px 14px", zIndex:1000, textAlign:"center", minWidth:110 }}>
          <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>🤖 Score IA</div>
          <div style={{ fontSize:30, fontWeight:900, color:C.accentBright, lineHeight:1 }}>78</div>
          <div style={{ fontSize:10, color:C.textMuted }}>/100</div>
          <div style={{ fontSize:10, color:C.accent, marginTop:4, fontWeight:600 }}>Baixo Risco</div>
        </div>

        {/* Status */}
        <div className="mapa-status" style={{ position:"absolute", top:70, left:16, background:`${C.surface}f0`, backdropFilter:"blur(12px)", border:`1px solid ${C.accent}40`, borderRadius:10, padding:"10px 12px", zIndex:1000 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:4 }}>✅ Status Ambiental</div>
          <div style={{ fontSize:11, color:C.textMuted }}>⛔ Sem embargo IBAMA</div>
          <div style={{ fontSize:11, color:C.textMuted }}>📡 Sem alerta PRODES</div>
          <div style={{ fontSize:11, color:C.textMuted }}>🌱 Moratória: Conforme</div>
        </div>
      </div>

      {/* PAINEL DIREITO */}
      <div className="mapa-painel-dir" style={{ width:220, background:C.surface, borderLeft:`1px solid ${C.border}`, padding:"16px 14px", flexShrink:0, overflowY:"auto" }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>🗂️ Camadas</div>
        {camadas.map(c => (
          <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:c.color, flexShrink:0 }} />
              <span style={{ fontSize:12, color:c.ativa ? C.text : C.textDim }}>{c.icon} {c.label}</span>
            </div>
            <div onClick={() => toggleCamada(c.id)} style={{ width:34, height:18, borderRadius:9, background:c.ativa ? C.green3 : C.border, position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
              <div style={{ position:"absolute", top:2, left:c.ativa?18:2, width:14, height:14, borderRadius:"50%", background:"white", transition:"left 0.2s" }} />
            </div>
          </div>
        ))}

        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📊 Estatísticas</div>
          {[
            ["Área Total",    "1.284,7 ha", C.accent],
            ["APP",           "183,4 ha",   C.blue],
            ["Reserva Legal", "399,8 ha",   C.accentBright],
            ["Área Produtiva","701,5 ha",   C.yellow],
          ].map(([l,v,c]) => (
            <div key={l} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                <span style={{ color:C.textMuted }}>{l}</span>
                <span style={{ fontWeight:700, color:c }}>{v}</span>
              </div>
              <div style={{ height:4, background:C.bg, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:l==="Área Total"?"100%":l==="APP"?"14%":l==="Reserva Legal"?"31%":"55%", background:`linear-gradient(90deg,${c}80,${c})`, borderRadius:2 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>🔗 Links Úteis</div>
          {[
            ["🌿 SICAR",  "https://www.car.gov.br"],
            ["⛔ IBAMA",  "https://ibama.gov.br"],
            ["📡 INPE",   "http://terrabrasilis.dpi.inpe.br"],
            ["🗂️ SIGEF",  "https://sigef.incra.gov.br"],
            ["📋 INCRA",  "https://www.gov.br/incra"],
          ].map(([l, url]) => (
            <a key={l} href={url} target="_blank" rel="noreferrer"
              style={{ display:"block", fontSize:11, color:C.textMuted, padding:"5px 0", borderBottom:`1px solid ${C.border}`, textDecoration:"none" }}
              onMouseOver={e=>e.target.style.color=C.accentBright}
              onMouseOut={e=>e.target.style.color=C.textMuted}>
              {l} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}