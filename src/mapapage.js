import { useState, useEffect, useRef } from "react";

const C = {
  bg:"#0a0f0a", surface:"#0f1a0f", card:"#111d11",
  border:"#1e3a1e", borderLight:"#2a4f2a",
  green1:"#0d5c2e", green2:"#12803f", green3:"#16a34a",
  accent:"#22c55e", accentBright:"#4ade80",
  text:"#e8f5e9", textMuted:"#6b9e6b", textDim:"#3d6b3d",
  yellow:"#fbbf24", red:"#ef4444", orange:"#f97316", blue:"#3b82f6",
  purple:"#a78bfa",
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

const TIPOS_BUSCA = [
  { id:"car",          label:"CAR",          icon:"📋", placeholder:"Ex: MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C" },
  { id:"gps",          label:"GPS",          icon:"📍", placeholder:"Ex: -11.8456, -55.1987" },
  { id:"ccir",         label:"CCIR",         icon:"📄", placeholder:"Ex: 110.035.031.500-2" },
  { id:"itr",          label:"ITR",          icon:"💰", placeholder:"Ex: 12.345.678-9" },
  { id:"proprietario", label:"Proprietário", icon:"👤", placeholder:"Ex: João da Silva" },
  { id:"fazenda",      label:"Fazenda",      icon:"🌾", placeholder:"Ex: Fazenda Horizonte Verde" },
];

const FAZENDA_MOCK = {
  nome:"Fazenda Horizonte Verde", car:"MT-5107040-9B4D7A3E2F1C6B8A0D5E9F3C",
  municipio:"Sinop, MT", area:"1.284,7 ha", ccir:"800.429.7412-9",
  itr:"R$ 2.847,00/ano", proprietario:"Agropecuária Horizonte Ltda.",
  modulos:"42,8 módulos fiscais", sigef:"Certificado",
  app:"183,4 ha (14,3%)", rl:"399,8 ha (31,1%)",
  coordenadas:{ lat:-11.8456, lng:-55.1987 }, embargo:false, prodes:false,
};

const chip = (txt, color) => (
  <span style={{ display:"inline-flex",alignItems:"center",fontSize:11,fontWeight:600,padding:"3px 9px",borderRadius:20,background:`${color}20`,color,border:`1px solid ${color}30` }}>{txt}</span>
);

const InfoRow = ({ label, value }) => (
  <div style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11 }}>
    <span style={{ color:C.textMuted }}>{label}</span>
    <span style={{ fontWeight:600,color:C.text,textAlign:"right",maxWidth:140 }}>{value ?? "—"}</span>
  </div>
);

function CardClima({ clima }) {
  if (!clima?.encontrado) return null;
  const a = clima.atual;
  const maxChuva = Math.max(...(clima.previsao7dias||[]).map(x=>x.chuva), 1);
  return (
    <div style={{ background:C.card,border:`1px solid ${C.blue}30`,borderRadius:14,padding:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
        <div style={{ fontSize:12,fontWeight:700 }}>🌤️ Clima Atual</div>
        <span style={{ fontSize:10,color:C.textMuted }}>{a?.descricao}</span>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10 }}>
        {[["🌡️ Temp.",`${a?.temperatura??'--'}°C`],["💧 Umidade",`${a?.umidade??'--'}%`],["💨 Vento",`${a?.vento??'--'} km/h`],["🌧️ Chuva",`${a?.precipitacao??0} mm`]].map(([l,v])=>(
          <div key={l} style={{ background:`${C.blue}10`,border:`1px solid ${C.blue}20`,borderRadius:8,padding:"7px 9px" }}>
            <div style={{ fontSize:10,color:C.textMuted }}>{l}</div>
            <div style={{ fontSize:13,fontWeight:800,color:C.blue }}>{v}</div>
          </div>
        ))}
      </div>
      {(clima.previsao7dias||[]).length>0&&(
        <>
          <div style={{ fontSize:10,color:C.textMuted,marginBottom:5 }}>Previsão 7 dias (mm chuva)</div>
          <div style={{ display:"flex",alignItems:"flex-end",gap:3,height:38 }}>
            {clima.previsao7dias.map((d,i)=>(
              <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                <div style={{ width:"100%",height:`${Math.max((d.chuva/maxChuva)*100,4)}%`,background:`linear-gradient(180deg,${C.blue}90,${C.blue}40)`,borderRadius:"3px 3px 0 0",minHeight:3 }}/>
                <span style={{ fontSize:9,color:C.textDim }}>{d.dataFormatada}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop:6,fontSize:11,color:C.textMuted }}>🌧️ 30d: <strong style={{ color:C.blue }}>{clima.precipTotal30d} mm</strong></div>
        </>
      )}
    </div>
  );
}

function CardNASA({ nasa }) {
  if (!nasa?.encontrado) return null;
  return (
    <div style={{ background:C.card,border:`1px solid ${C.purple}30`,borderRadius:14,padding:14 }}>
      <div style={{ fontSize:12,fontWeight:700,marginBottom:10 }}>🛰️ Solo & Radiação — NASA</div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
        {[["☀️ Radiação Solar",nasa.radiacaoSolar?`${nasa.radiacaoSolar} MJ/m²`:"—"],["🌡️ Temp. Média",nasa.temperaturaMedia?`${nasa.temperaturaMedia}°C`:"—"],["🌧️ Precip. Média",nasa.precipitacaoMedia?`${nasa.precipitacaoMedia} mm/d`:"—"],["💧 Umid. Relativa",nasa.umidadeRelativa?`${nasa.umidadeRelativa}%`:"—"]].map(([l,v])=>(
          <div key={l} style={{ background:`${C.purple}10`,border:`1px solid ${C.purple}20`,borderRadius:8,padding:"7px 9px" }}>
            <div style={{ fontSize:10,color:C.textMuted }}>{l}</div>
            <div style={{ fontSize:13,fontWeight:800,color:C.purple }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:6,fontSize:10,color:C.textDim,textAlign:"center" }}>Média 7 dias · NASA POWER</div>
    </div>
  );
}

function CardCotacoes({ cotacoes }) {
  if (!cotacoes?.encontrado) return null;
  const prods = cotacoes.produtos || {};
  return (
    <div style={{ background:C.card,border:`1px solid ${C.yellow}30`,borderRadius:14,padding:14 }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
        <div style={{ fontSize:12,fontWeight:700 }}>📊 Cotações CEPEA</div>
        {cotacoes.dolarHoje&&<span style={{ fontSize:10,color:C.textMuted }}>💵 R$ {Number(cotacoes.dolarHoje).toFixed(2)}</span>}
      </div>
      {Object.entries(prods).map(([k,v])=>(
        <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${C.border}` }}>
          <div><div style={{ fontSize:12,fontWeight:600,color:C.text }}>{v.nome}</div><div style={{ fontSize:10,color:C.textMuted }}>{v.unidade}</div></div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13,fontWeight:800,color:C.yellow }}>{v.preco?`R$ ${Number(v.preco).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"—"}</div>
            {v.variacao!==null&&<div style={{ fontSize:10,color:v.variacao>=0?C.accent:C.red }}>{v.variacao>=0?"▲":"▼"} {Math.abs(v.variacao).toFixed(1)}%</div>}
          </div>
        </div>
      ))}
      <div style={{ marginTop:5,fontSize:10,color:C.textDim,textAlign:"center" }}>Ref. {cotacoes.atualizadoEm}</div>
    </div>
  );
}

function CardScore({ score }) {
  if (!score) return null;
  const cor = score.cor;
  return (
    <div style={{ background:C.card,border:`1px solid ${cor}30`,borderRadius:14,padding:14,textAlign:"center",marginBottom:16 }}>
      <div style={{ fontSize:11,color:C.textMuted,marginBottom:8 }}>🤖 Score IA</div>
      <div style={{ width:80,height:80,borderRadius:"50%",background:`conic-gradient(${cor} 0deg,${cor} ${(score.valor/100)*360}deg,${C.border} ${(score.valor/100)*360}deg)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px" }}>
        <div style={{ width:60,height:60,borderRadius:"50%",background:C.card,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
          <div style={{ fontSize:22,fontWeight:900,color:cor,lineHeight:1 }}>{score.valor}</div>
          <div style={{ fontSize:9,color:C.textMuted }}>/100</div>
        </div>
      </div>
      <div style={{ fontSize:12,fontWeight:700,color:cor,marginBottom:8 }}>{score.nivel}</div>
      {score.fatores?.map((f,i)=>(
        <div key={i} style={{ display:"flex",justifyContent:"space-between",fontSize:10,padding:"3px 0",borderBottom:`1px solid ${C.border}` }}>
          <span style={{ color:C.textMuted }}>{f.label}</span>
          <span style={{ fontWeight:700,color:f.cor }}>{f.impacto===0?"✅":f.impacto}</span>
        </div>
      ))}
    </div>
  );
}

export default function MapaPage() {
  const mapRef      = useRef(null);
  const leafletMap  = useRef(null);
  const kmlLayerRef = useRef(null);
  const [camadas,    setCamadas]    = useState(CAMADAS);
  const [tipoMapa,   setTipoMapa]   = useState("satellite");
  const [fazenda,    setFazenda]    = useState(FAZENDA_MOCK);
  const [dadosReais, setDadosReais] = useState(null);
  const [kmlNome,    setKmlNome]    = useState(null);
  const [tipoBusca,  setTipoBusca]  = useState("car");
  const [searchVal,  setSearchVal]  = useState("");
  const [buscando,   setBuscando]   = useState(false);
  const [erroBusca,  setErroBusca]  = useState(null);
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
    const map = L.map(mapRef.current, { center:[FAZENDA_MOCK.coordenadas.lat, FAZENDA_MOCK.coordenadas.lng], zoom:13, zoomControl:false });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution:"© Esri", maxZoom:19 }).addTo(map);
    L.control.zoom({ position:"bottomright" }).addTo(map);
    leafletMap.current = map;
    desenharMock(map, L);
  };

  const desenharMock = (map, L) => {
    const { lat, lng } = FAZENDA_MOCK.coordenadas;
    const o = 0.05;
    const pol = L.polygon([[lat+o,lng-o*.5],[lat+o,lng+o],[lat,lng+o*1.5],[lat-o,lng+o],[lat-o,lng-o*.5],[lat,lng-o*1.2]], { color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.15 }).addTo(map);
    L.polygon([[lat+o*.3,lng-o*.3],[lat+o*.5,lng+o*.3],[lat+o*.2,lng+o*.6],[lat,lng+o*.4],[lat-o*.1,lng]], { color:"#60a5fa",weight:2,fillColor:"#60a5fa",fillOpacity:0.2,dashArray:"5,5" }).addTo(map);
    L.polygon([[lat-o*.2,lng-o*.4],[lat-o*.1,lng+o*.1],[lat-o*.4,lng+o*.2],[lat-o*.5,lng-o*.2]], { color:"#4ade80",weight:2,fillColor:"#4ade80",fillOpacity:0.25,dashArray:"8,4" }).addTo(map);
    const icon = L.divIcon({ html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`, iconSize:[36,36], iconAnchor:[18,36], className:"" });
    L.marker([lat,lng],{icon}).addTo(map).bindPopup(`<div style="font-family:sans-serif;min-width:200px"><div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:4px">🌿 ${FAZENDA_MOCK.nome}</div><div style="font-size:12px;color:#666">📍 ${FAZENDA_MOCK.municipio} · ${FAZENDA_MOCK.area}</div><hr style="margin:8px 0;border-color:#eee"/><div style="font-size:11px;color:#22c55e;font-weight:700">✅ Dados de demonstração</div></div>`);
    map.fitBounds(pol.getBounds(), { padding:[40,40] });
  };

  const desenharReal = (map, L, geometria, dados) => {
    // Remove camadas anteriores (exceto tiles)
    Object.values(map._layers).forEach(layer => {
      if (layer._latlngs || layer._latlng) map.removeLayer(layer);
    });
    const geoLayer = L.geoJSON(geometria, { style:{ color:"#22c55e",weight:3,fillColor:"#22c55e",fillOpacity:0.2 } }).addTo(map);
    const bounds = geoLayer.getBounds();
    const center = bounds.getCenter();
    const icon = L.divIcon({ html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:36px;height:36px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4)"></div>`, iconSize:[36,36], iconAnchor:[18,36], className:"" });
    L.marker([center.lat,center.lng],{icon}).addTo(map).bindPopup(`
      <div style="font-family:sans-serif;min-width:220px">
        <div style="font-weight:800;font-size:14px;color:#0d5c2e;margin-bottom:6px">🌿 ${dados.sicar?.nome||dados.car||"Imóvel Rural"}</div>
        <div style="font-size:12px;color:#666;margin-bottom:3px">📍 ${dados.sicar?.municipio||""} ${dados.sicar?.uf?`· ${dados.sicar.uf}`:""}</div>
        <div style="font-size:12px;color:#666;margin-bottom:3px">🌾 ${dados.sicar?.area||"—"}</div>
        <hr style="margin:8px 0;border-color:#eee"/>
        <div style="font-size:11px;margin-bottom:3px">${dados.ibama?.temEmbargo?"🔴 Embargo IBAMA ativo":"✅ Sem embargo IBAMA"}</div>
        <div style="font-size:11px;margin-bottom:3px">${dados.prodes?.temAlerta?"🔴 Alerta PRODES":"✅ Sem alerta PRODES"}</div>
        <div style="font-size:11px;color:#22c55e;font-weight:700">Score: ${dados.score?.valor}/100 — ${dados.score?.nivel}</div>
      </div>
    `);
    map.fitBounds(bounds, { padding:[40,40] });
  };

  // ── Importar KML e renderizar no mapa ──
  const importarKML = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setKmlNome(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const kmlText = ev.target.result;
        renderizarKML(kmlText, file.name);
      } catch { alert("Erro ao ler KML."); }
    };
    reader.readAsText(file);
  };

  const renderizarKML = (kmlText, nomeArquivo) => {
    if (!leafletMap.current || !window.L) return;
    const L = window.L;
    const map = leafletMap.current;

    // Remove KML anterior
    if (kmlLayerRef.current) {
      map.removeLayer(kmlLayerRef.current);
      kmlLayerRef.current = null;
    }

    try {
      // Parse KML — extrai coordenadas dos Placemark/Polygon
      const parser = new DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, "text/xml");

      const layers = [];

      // Processa Polygons
      const polygons = kmlDoc.querySelectorAll("Polygon");
      polygons.forEach(poly => {
        const coordsEl = poly.querySelector("outerBoundaryIs coordinates, coordinates");
        if (!coordsEl) return;
        const raw = coordsEl.textContent.trim().split(/\s+/);
        const latlngs = raw.map(c => {
          const parts = c.split(",");
          if (parts.length < 2) return null;
          return [parseFloat(parts[1]), parseFloat(parts[0])];
        }).filter(Boolean);
        if (latlngs.length > 0) {
          layers.push(L.polygon(latlngs, { color:"#22c55e", weight:3, fillColor:"#22c55e", fillOpacity:0.2 }));
        }
      });

      // Processa LineStrings
      const lines = kmlDoc.querySelectorAll("LineString coordinates");
      lines.forEach(coordsEl => {
        const raw = coordsEl.textContent.trim().split(/\s+/);
        const latlngs = raw.map(c => {
          const parts = c.split(",");
          if (parts.length < 2) return null;
          return [parseFloat(parts[1]), parseFloat(parts[0])];
        }).filter(Boolean);
        if (latlngs.length > 0) {
          layers.push(L.polyline(latlngs, { color:"#22c55e", weight:3 }));
        }
      });

      // Processa Points/Placemarks
      const points = kmlDoc.querySelectorAll("Point coordinates");
      points.forEach(coordsEl => {
        const parts = coordsEl.textContent.trim().split(",");
        if (parts.length >= 2) {
          const lat = parseFloat(parts[1]);
          const lng = parseFloat(parts[0]);
          const icon = L.divIcon({
            html:`<div style="background:linear-gradient(135deg,#12803f,#22c55e);width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
            iconSize:[28,28], iconAnchor:[14,28], className:"",
          });
          layers.push(L.marker([lat, lng], { icon }));
        }
      });

      if (layers.length === 0) {
        alert("⚠️ KML importado mas nenhuma geometria encontrada.");
        return;
      }

      const group = L.layerGroup(layers).addTo(map);
      kmlLayerRef.current = group;

      // Centraliza no KML
      const bounds = L.featureGroup(layers).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding:[40,40] });

      alert(`✅ KML "${nomeArquivo}" carregado com ${layers.length} elemento(s) no mapa!`);
    } catch (err) {
      alert(`❌ Erro ao processar KML: ${err.message}`);
    }
  };

  const buscarImovel = async () => {
    const val = searchVal.trim();
    if (!val || buscando) return;
    setBuscando(true);
    setErroBusca(null);
    try {
      let body = {};
      if (tipoBusca === "gps") {
        const gps = val.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
        if (!gps) { setErroBusca("GPS inválido. Use: -11.8456, -55.1987"); setBuscando(false); return; }
        body = { lat:parseFloat(gps[1]), lng:parseFloat(gps[2]) };
      } else if (tipoBusca === "ccir") { body = { ccir: val };
      } else if (tipoBusca === "itr") { body = { itr: val };
      } else if (tipoBusca === "proprietario") { body = { proprietario: val };
      } else if (tipoBusca === "fazenda") { body = { nomeFazenda: val };
      } else { body = { car: val }; }

      const resp = await fetch("/api/consulta", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
      const dados = await resp.json();
      if (!dados.sucesso) { setErroBusca(dados.error||"Erro na consulta."); setBuscando(false); return; }
      setDadosReais(dados);

      if (dados.sicar?.encontrado) {
        setFazenda(prev=>({
          ...prev,
          nome: dados.sicar.nome || prev.nome,
          municipio: `${dados.sicar.municipio||""}, ${dados.sicar.uf||""}`,
          area: dados.sicar.area || prev.area,
          app: dados.sicar.app || prev.app,
          rl: dados.sicar.rl || prev.rl,
          proprietario: dados.sicar.proprietario || prev.proprietario,
          modulos: dados.sicar.modulos || prev.modulos,
          sigef: dados.sigef?.situacaoLabel || prev.sigef,
          ccir: dados.sigef?.ccir || dados.sicar?.ccir || prev.ccir,
          itr: dados.sicar?.nirf ? `NIRF: ${dados.sicar.nirf}` : prev.itr,
          embargo: dados.ibama?.temEmbargo || false,
          prodes: dados.prodes?.temAlerta || false,
          coordenadas: dados.coordenadas?.lat ? dados.coordenadas : prev.coordenadas,
        }));
      }

      if (leafletMap.current && window.L) {
        const geom = dados.sicar?.geometria || dados.sigef?.geometria;
        if (geom) desenharReal(leafletMap.current, window.L, geom, dados);
        else if (dados.coordenadas?.lat) leafletMap.current.setView([dados.coordenadas.lat, dados.coordenadas.lng], 13);
      }
    } catch { setErroBusca("Erro de conexão."); }
    setBuscando(false);
  };

  const exportarKML = () => {
    const kml=`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><n>${fazenda.nome}</n><Placemark><n>${fazenda.nome}</n><Polygon><outerBoundaryIs><LinearRing><coordinates>${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng+0.05},${fazenda.coordenadas.lat+0.05},0 ${fazenda.coordenadas.lng+0.075},${fazenda.coordenadas.lat},0 ${fazenda.coordenadas.lng-0.05},${fazenda.coordenadas.lat+0.05},0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([kml],{type:"application/vnd.google-earth.kml+xml"}));
    a.download = `${fazenda.nome.replace(/ /g,"_")}.kml`;
    a.click();
  };

  const trocarMapa = (tipo) => {
    if (!leafletMap.current||!window.L) return;
    const map=leafletMap.current, L=window.L;
    Object.values(map._layers).forEach(l=>{ if(l._url) map.removeLayer(l); });
    if (tipo==="satellite") L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19}).addTo(map);
    else if (tipo==="mapa") L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);
    else if (tipo==="terreno") L.tileLayer("https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png",{maxZoom:18}).addTo(map);
    setTipoMapa(tipo);
  };

  const toggleCamada = (id) => setCamadas(prev=>prev.map(c=>c.id===id?{...c,ativa:!c.ativa}:c));

  const score     = dadosReais?.score;
  const clima     = dadosReais?.clima;
  const nasa      = dadosReais?.nasa;
  const cotacoes  = dadosReais?.cotacoes;
  const scoreValor = score?.valor ?? 78;
  const scoreCor   = score?.cor   ?? C.accent;
  const tipoAtual  = TIPOS_BUSCA.find(t=>t.id===tipoBusca);

  const PainelMobileInfo = () => (
    <div className="mapa-mobile-info" style={{ display:"none", flexDirection:"column", gap:10, padding:14, borderTop:`1px solid ${C.border}`, background:C.surface }}>
      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1, background:C.card, border:`1px solid ${scoreCor}30`, borderRadius:14, padding:14, textAlign:"center" }}>
          <div style={{ fontSize:11, color:C.textMuted, marginBottom:6 }}>🤖 Score IA</div>
          <div style={{ fontSize:36, fontWeight:900, color:scoreCor, lineHeight:1 }}>{scoreValor}</div>
          <div style={{ fontSize:10, color:C.textMuted }}>/100</div>
          <div style={{ fontSize:11, color:scoreCor, marginTop:6, fontWeight:700 }}>{score?.nivel ?? "Baixo Risco"}</div>
        </div>
        <div style={{ flex:1, background:C.card, border:`1px solid ${C.accent}30`, borderRadius:14, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:8 }}>{dadosReais?"📡 Status Real":"✅ Status Ambiental"}</div>
          {[[fazenda.embargo?"⛔":"✅", fazenda.embargo?"Embargo IBAMA":"Sem embargo IBAMA"],[fazenda.prodes?"🔴":"📡",fazenda.prodes?"Alerta PRODES":"Sem alerta PRODES"],["🌱",dadosReais?"Dados verificados":"Moratória: Conforme"]].map(([icon,txt])=>(
            <div key={txt} style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5, fontSize:11 }}>
              <span>{icon}</span><span style={{ color:C.textMuted }}>{txt}</span>
            </div>
          ))}
        </div>
      </div>
      {clima    && <CardClima clima={clima} />}
      {nasa     && <CardNASA nasa={nasa} />}
      {cotacoes && <CardCotacoes cotacoes={cotacoes} />}
    </div>
  );

  return (
    <div className="mapa-container" style={{ display:"flex", height:"calc(100vh - 64px)", overflow:"hidden" }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){
          .mapa-container{flex-direction:column!important;height:auto!important;min-height:calc(100vh - 128px);overflow-y:auto!important;}
          .mapa-painel-esq{width:100%!important;border-right:none!important;border-bottom:1px solid #1e3a1e!important;}
          .mapa-centro{width:100%!important;height:72vw!important;min-height:260px!important;max-height:400px!important;flex:none!important;}
          .mapa-painel-dir{display:none!important;}
          .mapa-toolbar-camadas{display:none!important;}
          .mapa-score{display:none!important;}
          .mapa-status{display:none!important;}
          .mapa-legenda{bottom:6px!important;left:6px!important;padding:8px 10px!important;}
          .mapa-mobile-info{display:flex!important;}
        }
      `}</style>

      {/* ── PAINEL ESQUERDO ── */}
      <div className="mapa-painel-esq" style={{ width:290, background:C.surface, borderRight:`1px solid ${C.border}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto" }}>

        {/* Busca com chips */}
        <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>🔍 Buscar Imóvel</div>
          <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:8 }}>
            {TIPOS_BUSCA.map(t=>(
              <button key={t.id} onClick={()=>{setTipoBusca(t.id);setSearchVal("");}} style={{ padding:"4px 10px", borderRadius:20, border:`1px solid ${tipoBusca===t.id?C.accent:C.border}`, background:tipoBusca===t.id?`${C.accent}20`:"transparent", color:tipoBusca===t.id?C.accent:C.textMuted, fontSize:10, fontWeight:tipoBusca===t.id?700:400, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            <input
              style={{ flex:1, background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", color:C.text, fontSize:12, outline:"none" }}
              placeholder={tipoAtual?.placeholder||""}
              value={searchVal}
              onChange={e=>setSearchVal(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&buscarImovel()}
            />
            <button onClick={buscarImovel} disabled={buscando} style={{ background:buscando?C.border:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", borderRadius:8, color:C.text, width:36, cursor:buscando?"default":"pointer", fontSize:14, flexShrink:0, opacity:buscando?0.7:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
              {buscando?<div style={{ width:14,height:14,border:`2px solid ${C.text}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite" }}/>:"🔍"}
            </button>
          </div>
          {erroBusca&&<div style={{ marginTop:8,fontSize:11,color:C.red,background:`${C.red}15`,borderRadius:6,padding:"6px 10px" }}>⚠️ {erroBusca}</div>}
          {dadosReais&&<div style={{ marginTop:8,fontSize:11,color:C.accent,background:`${C.accent}15`,borderRadius:6,padding:"6px 10px" }}>✅ Dados reais · {new Date(dadosReais.atualizadoEm).toLocaleTimeString("pt-BR")}</div>}
        </div>

        {/* Dados do imóvel */}
        <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>📋 Dados do Imóvel</div>
            {chip(dadosReais?"✓ Dados Reais":"Demo", dadosReais?C.accent:C.textMuted)}
          </div>
          <div style={{ fontSize:13, fontWeight:800, color:C.accentBright, marginBottom:3 }}>{fazenda.nome}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginBottom:10 }}>📍 {fazenda.municipio}</div>
          <InfoRow label="🌾 Área Total"      value={fazenda.area} />
          <InfoRow label="📋 CAR"             value={fazenda.car?.substring(0,18)+"..."} />
          <InfoRow label="📄 CCIR"            value={fazenda.ccir} />
          <InfoRow label="💰 ITR/NIRF"        value={fazenda.itr} />
          <InfoRow label="👤 Proprietário"    value={fazenda.proprietario?.substring(0,22)+"..."} />
          <InfoRow label="📐 Módulos Fiscais" value={fazenda.modulos} />
          <InfoRow label="🗂️ SIGEF"           value={fazenda.sigef} />
          <InfoRow label="💧 APP"             value={fazenda.app} />
          <InfoRow label="🌱 Reserva Legal"   value={fazenda.rl} />
          <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
            {chip(fazenda.embargo?"⛔ Embargo IBAMA":"✅ Sem Embargo", fazenda.embargo?C.red:C.accent)}
            {chip(fazenda.prodes?"🔴 Alerta PRODES":"📡 Sem PRODES", fazenda.prodes?C.orange:C.accent)}
          </div>
        </div>

        {/* Coordenadas */}
        <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>📍 Coordenadas</div>
          <InfoRow label="Latitude"  value={`${fazenda.coordenadas.lat}°`} />
          <InfoRow label="Longitude" value={`${fazenda.coordenadas.lng}°`} />
          <button onClick={()=>leafletMap.current?.setView([fazenda.coordenadas.lat,fazenda.coordenadas.lng],13)} style={{ marginTop:8, width:"100%", padding:"7px 0", borderRadius:8, background:`${C.green1}60`, border:`1px solid ${C.borderLight}`, color:C.accentBright, fontSize:11, fontWeight:600, cursor:"pointer" }}>
            🎯 Centralizar no Mapa
          </button>
        </div>

        {/* Cards desktop após busca */}
        {clima    && <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}><CardClima clima={clima}/></div>}
        {nasa     && <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}><CardNASA nasa={nasa}/></div>}
        {cotacoes && <div style={{ padding:14, borderBottom:`1px solid ${C.border}` }}><CardCotacoes cotacoes={cotacoes}/></div>}

        {/* Ações */}
        <div style={{ padding:14 }}>
          <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>⚡ Ações</div>
          <input type="file" accept=".kml,.kmz" ref={fileRef} style={{ display:"none" }} onChange={importarKML} />
          {[
            ["📥 Importar KML",    ()=>fileRef.current?.click(), C.blue],
            ["📤 Exportar KML",    exportarKML,                  C.accent],
            ["📄 Gerar Laudo PDF", ()=>alert("Em breve!"),       C.yellow],
            ["💬 Enviar WhatsApp", ()=>alert("Em breve!"),       C.accentBright],
          ].map(([l,fn,c])=>(
            <button key={l} onClick={fn} style={{ display:"block", width:"100%", marginBottom:7, padding:"8px 12px", borderRadius:8, textAlign:"left", background:`${c}15`, border:`1px solid ${c}40`, color:c, fontWeight:600, fontSize:11.5, cursor:"pointer" }}>{l}</button>
          ))}
          {kmlNome&&<div style={{ fontSize:11, color:C.accent, marginTop:4 }}>✅ KML: {kmlNome}</div>}
        </div>
      </div>

      {/* ── MAPA ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>
        <div className="mapa-centro" style={{ flex:1, position:"relative", display:"flex", flexDirection:"column", minWidth:0 }}>

          {/* Toolbar */}
          <div style={{ background:`${C.surface}f0`, backdropFilter:"blur(12px)", borderBottom:`1px solid ${C.border}`, padding:"8px 14px", display:"flex", alignItems:"center", gap:8, flexShrink:0, flexWrap:"wrap" }}>
            <div style={{ display:"flex", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, padding:3, gap:2 }}>
              {[["satellite","🛰️ Satélite"],["mapa","🗺️ Mapa"],["terreno","🏔️ Terreno"]].map(([k,l])=>(
                <button key={k} onClick={()=>trocarMapa(k)} style={{ padding:"5px 10px", borderRadius:6, border:"none", cursor:"pointer", fontSize:11, fontWeight:tipoMapa===k?700:400, background:tipoMapa===k?`linear-gradient(135deg,${C.green2},${C.green3})`:"transparent", color:tipoMapa===k?C.text:C.textMuted }}>{l}</button>
              ))}
            </div>
            <div className="mapa-toolbar-camadas" style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {camadas.slice(0,5).map(c=>(
                <button key={c.id} onClick={()=>toggleCamada(c.id)} style={{ padding:"4px 9px", borderRadius:20, border:`1px solid ${c.ativa?c.color+"60":C.border}`, background:c.ativa?`${c.color}20`:"transparent", color:c.ativa?c.color:C.textDim, fontSize:11, cursor:"pointer" }}>{c.icon} {c.label}</button>
              ))}
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
              <button onClick={()=>fileRef.current?.click()} style={{ padding:"5px 10px", borderRadius:8, background:C.card, border:`1px solid ${C.border}`, color:C.accentBright, fontSize:11, fontWeight:600, cursor:"pointer" }}>📥 KML</button>
              <button onClick={exportarKML} style={{ padding:"5px 10px", borderRadius:8, background:`linear-gradient(135deg,${C.green2},${C.green3})`, border:"none", color:C.text, fontSize:11, fontWeight:600, cursor:"pointer" }}>📤 Exportar</button>
            </div>
          </div>

          {/* Mapa Leaflet */}
          <div ref={mapRef} style={{ flex:1, background:`linear-gradient(135deg,${C.bg},#0d2010)` }} />

          {/* Legenda */}
          <div className="mapa-legenda" style={{ position:"absolute", bottom:40, left:16, background:`${C.surface}ee`, backdropFilter:"blur(12px)", border:`1px solid ${C.border}`, borderRadius:12, padding:"10px 12px", zIndex:1000 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.textMuted, marginBottom:6, textTransform:"uppercase" }}>Legenda</div>
            {camadas.filter(c=>c.ativa).map(c=>(
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4, fontSize:11 }}>
                <div style={{ width:16, height:4, borderRadius:2, background:c.color, flexShrink:0 }}/>
                <span style={{ color:C.textMuted }}>{c.label}</span>
              </div>
            ))}
            {kmlNome&&<div style={{ marginTop:6, fontSize:10, color:C.blue }}>📥 {kmlNome}</div>}
          </div>

          {/* Score desktop */}
          <div className="mapa-score" style={{ position:"absolute", top:70, right:16, background:`${C.surface}ee`, backdropFilter:"blur(12px)", border:`1px solid ${scoreCor}40`, borderRadius:12, padding:"12px 14px", zIndex:1000, textAlign:"center", minWidth:110 }}>
            <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>🤖 Score IA</div>
            <div style={{ fontSize:30, fontWeight:900, color:scoreCor, lineHeight:1 }}>{scoreValor}</div>
            <div style={{ fontSize:10, color:C.textMuted }}>/100</div>
            <div style={{ fontSize:10, color:scoreCor, marginTop:4, fontWeight:600 }}>{score?.nivel??"Baixo Risco"}</div>
          </div>

          {/* Status desktop */}
          <div className="mapa-status" style={{ position:"absolute", top:70, left:16, background:`${C.surface}ee`, backdropFilter:"blur(12px)", border:`1px solid ${C.accent}40`, borderRadius:10, padding:"10px 12px", zIndex:1000 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.accent, marginBottom:4 }}>{dadosReais?"📡 Status Real":"✅ Status Ambiental"}</div>
            <div style={{ fontSize:11, color:fazenda.embargo?C.red:C.textMuted }}>{fazenda.embargo?"⛔ Embargo IBAMA ativo":"⛔ Sem embargo IBAMA"}</div>
            <div style={{ fontSize:11, color:fazenda.prodes?C.orange:C.textMuted }}>{fazenda.prodes?"🔴 Alerta PRODES ativo":"📡 Sem alerta PRODES"}</div>
            <div style={{ fontSize:11, color:C.textMuted }}>🌱 Moratória: Conforme</div>
            {dadosReais?.sigef?.certificado&&<div style={{ fontSize:11, color:C.accent }}>🗂️ SIGEF Certificado ✅</div>}
          </div>

          {/* Loading overlay */}
          {buscando&&(
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, backdropFilter:"blur(4px)" }}>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"24px 32px", textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🔍</div>
                <div style={{ fontSize:14, fontWeight:700, color:C.accentBright, marginBottom:4 }}>Consultando APIs...</div>
                <div style={{ fontSize:12, color:C.textMuted }}>SICAR · IBAMA · PRODES · SIGEF · Clima · NASA</div>
              </div>
            </div>
          )}
        </div>

        <PainelMobileInfo />
      </div>

      {/* ── PAINEL DIREITO desktop ── */}
      <div className="mapa-painel-dir" style={{ width:230, background:C.surface, borderLeft:`1px solid ${C.border}`, padding:"16px 14px", flexShrink:0, overflowY:"auto" }}>
        {score&&<CardScore score={score}/>}
        <div style={{ fontSize:13, fontWeight:700, marginBottom:14 }}>🗂️ Camadas</div>
        {camadas.map(c=>(
          <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <div style={{ width:10, height:10, borderRadius:2, background:c.color, flexShrink:0 }}/>
              <span style={{ fontSize:12, color:c.ativa?C.text:C.textDim }}>{c.icon} {c.label}</span>
            </div>
            <div onClick={()=>toggleCamada(c.id)} style={{ width:34, height:18, borderRadius:9, background:c.ativa?C.green3:C.border, position:"relative", cursor:"pointer", transition:"background 0.2s", flexShrink:0 }}>
              <div style={{ position:"absolute", top:2, left:c.ativa?18:2, width:14, height:14, borderRadius:"50%", background:"white", transition:"left 0.2s" }}/>
            </div>
          </div>
        ))}
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📊 Estatísticas</div>
          {[["Área Total",fazenda.area,C.accent],["APP",fazenda.app,C.blue],["Reserva Legal",fazenda.rl,C.accentBright]].map(([l,v,c])=>(
            <div key={l} style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                <span style={{ color:C.textMuted }}>{l}</span>
                <span style={{ fontWeight:700, color:c }}>{v||"—"}</span>
              </div>
              <div style={{ height:4, background:C.bg, borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:l==="Área Total"?"100%":l==="APP"?"14%":"31%", background:`linear-gradient(90deg,${c}80,${c})`, borderRadius:2 }}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>🔗 Links Úteis</div>
          {[["🌿 SICAR","https://www.car.gov.br"],["⛔ IBAMA","https://ibama.gov.br"],["📡 INPE","http://terrabrasilis.dpi.inpe.br"],["🗂️ SIGEF","https://sigef.incra.gov.br"],["📋 INCRA","https://www.gov.br/incra"]].map(([l,url])=>(
            <a key={l} href={url} target="_blank" rel="noreferrer" style={{ display:"block", fontSize:11, color:C.textMuted, padding:"5px 0", borderBottom:`1px solid ${C.border}`, textDecoration:"none" }} onMouseOver={e=>e.target.style.color=C.accentBright} onMouseOut={e=>e.target.style.color=C.textMuted}>{l} ↗</a>
          ))}
        </div>
      </div>
    </div>
  );
}
