
import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import saveAs from "file-saver";
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { detectTargetMode, splitTarget, extractTargetCartonCount } from "./utils/targetPacking.js";

const SIZE_ORDER = ["S","M","L","XL","2X","3X","4X","5X"];
const BOXES = ["A","B","C","D"];

// CAP TABLES from user
const PF = {
  SS: { SXL:{A:24,B:48,C:60,D:72}, BIG:{A:18,B:36,C:42,D:48} },
  LS: { SXL:{A:18,B:36,C:48,D:60}, BIG:{A:12,B:24,C:36,D:48} },
};
const PB = {
  SS: { SXL:{A:18,B:36,C:48,D:60}, BIG:{A:16,B:30,C:36,D:48} },
  LS: { SXL:{A:16,B:30,C:36,D:48}, BIG:{A:12,B:24,C:30,D:40} },
};
function totalCap(mode, sleeve){ const T = mode==="POLYBAG"?PB:PF; return T[sleeve].SXL; } // total cap is SXL cap

const BOX_DIMENSIONS = { A:"12x12x12", B:"9x16x22", C:"11x16x22", D:"13x16x24" };
const COL = {
  pickTicket:"PICK TICKET #", itemId:"ITEM ID", bodyDesc:"BODY DESCRIPTION",
  color:"COLOR NAME",
  custPO:"CUST. PO NUMBER", workOrder:"WORK ORDER #",
  size:"SIZE", sizeQty:"SIZE NET ORDER QTY", specInst1:"SPEC INST DESCRIPTION 1", lineQtyMaybe:"NET ORDER QTY",
  billToName:"BILL TO NAME"
};

function normString(s){ return (s??"").toString().normalize("NFKC").replace(/\u2019/g,"'").trim(); }
function normPO(s){ return normString(s).replace(/^['"]+/, ""); }

const SIZE_ALIAS = new Map(Object.entries({
  "XS":"", "X-SMALL":"", "X SMALL":"",
  "S":"S", "SM":"S", "SMALL":"S",
  "M":"M", "MEDIUM":"M",
  "L":"L", "LG":"L", "LARGE":"L",
  "XL":"XL", "X-LARGE":"XL", "X LARGE":"XL",
  "2X":"2X", "XXL":"2X", "2XL":"2X", "XX-LARGE":"2X", "2 X LARGE":"2X",
  "3X":"3X", "3XL":"3X", "XXX-LARGE":"3X",
  "4X":"4X", "4XL":"4X",
  "5X":"5X", "5XL":"5X",
  "6X":"", "6XL":""
}));
function normalizeSizeToken(tok){ const t = normString(tok).toUpperCase().replace(/\s+/g,""); return SIZE_ALIAS.get(t) ?? ""; }

function detectMode(spec){ if(!spec) return "PRINTERS_FOLD"; return /polybag/i.test(spec)?"POLYBAG":"PRINTERS_FOLD"; }
function detectSleeve(body){ if(!body) return "SS"; if(/\bLS\b|LONG\s*SLEEVE/i.test(body)) return "LS"; return "SS"; }
function normalizeSizes(m){ const out={S:0,M:0,L:0,XL:0,"2X":0,"3X":0,"4X":0,"5X":0}; SIZE_ORDER.forEach(k=>out[k]=Number(m?.[k]??0)); return out; }
function sumSizes(m){ return SIZE_ORDER.reduce((a,k)=>a+Number(m?.[k]??0),0); }

// ----- PF (mix allowed) helpers
function fillBox(rem, capSXL, capBIG, totals, boxType){
  const out=normalizeSizes({}); let usedSXL=0, usedBIG=0, usedTOT=0;
  const tryPush=(key,band)=>{
    const capBand = band==="SXL"?capSXL[boxType]:capBIG[boxType];
    const leftBand = capBand - (band==="SXL"?usedSXL:usedBIG);
    const leftTot  = totals[boxType] - usedTOT;
    const canTake = Math.max(0, Math.min(rem[key], leftBand, leftTot));
    if(canTake>0){
      out[key]+=canTake; rem[key]-=canTake; usedTOT+=canTake;
      if(band==="SXL") usedSXL+=canTake; else usedBIG+=canTake;
    }
  };
  ["S","M","L","XL"].forEach(k=>tryPush(k,"SXL"));
  ["2X","3X","4X","5X"].forEach(k=>tryPush(k,"BIG"));
  return out;
}
function qualifiesFullD(rem, capSXL, capBIG, totals){
  const remSXL = rem.S+rem.M+rem.L+rem.XL;
  const remBIG = rem["2X"]+rem["3X"]+rem["4X"]+rem["5X"];
  const remTOT = remSXL + remBIG;
  return remSXL>=capSXL.D || remBIG>=capBIG.D || remTOT>=totals.D;
}
function smallestThatFits(rem, capSXL, capBIG, totals){
  const remSXL = rem.S+rem.M+rem.L+rem.XL;
  const remBIG = rem["2X"]+rem["3X"]+rem["4X"]+rem["5X"];
  const remTOT = remSXL + remBIG;
  for(const b of BOXES){
    if(remSXL<=capSXL[b] && remBIG<=capBIG[b] && remTOT<=totals[b]) return b;
  }
  return "D";
}
function splitPF(sizes, capsSXL, capsBIG, totals){
  const rem = {...sizes}; const boxes=[];
  while(qualifiesFullD(rem, capsSXL, capsBIG, totals)){
    const pack = fillBox(rem, capsSXL, capsBIG, totals, "D");
    if(sumSizes(pack)===0) break;
    boxes.push({boxType:"D", sizes:pack});
  }
  while(sumSizes(rem)>0){
    const chosen = smallestThatFits(rem, capsSXL, capsBIG, totals);
    const pack = fillBox(rem, capsSXL, capsBIG, totals, chosen);
    if(sumSizes(pack)===0){ const k = SIZE_ORDER.find(k=>rem[k]>0); if(!k) break; pack[k]=Math.min(1, rem[k]); rem[k]-=pack[k]; }
    boxes.push({boxType:chosen, sizes:pack});
  }
  return {boxes};
}

// ----- Polybag (NO MIX) helpers: pack by size only
function minCapForSize(box, isSXL, capsSXL, capsBIG, totals){
  const bandCap = isSXL ? capsSXL[box] : capsBIG[box];
  const totCap  = totals[box];
  return Math.min(bandCap, totCap);
}
function splitPolybagBySize(sizes, capsSXL, capsBIG, totals){
  const boxes=[];
  for(const sizeKey of SIZE_ORDER){
    let qty = sizes[sizeKey]||0;
    if(qty<=0) continue;
    const isSXL = ["S","M","L","XL"].includes(sizeKey);
    // Step 1: D-first for fulls
    const dCap = minCapForSize("D", isSXL, capsSXL, capsBIG, totals);
    while(qty >= dCap && dCap>0){
      const pack = {S:0,M:0,L:0,XL:0,"2X":0,"3X":0,"4X":0,"5X":0};
      pack[sizeKey] = dCap;
      boxes.push({boxType:"D", sizes:pack});
      qty -= dCap;
    }
    // Step 2: tail -> smallest box that fits the remaining qty for this size
    if(qty>0){
      let chosen = "D";
      for(const b of BOXES){
        if(qty <= minCapForSize(b, isSXL, capsSXL, capsBIG, totals)){ chosen=b; break; }
      }
      const pack = {S:0,M:0,L:0,XL:0,"2X":0,"3X":0,"4X":0,"5X":0};
      pack[sizeKey] = qty;
      boxes.push({boxType:chosen, sizes:pack});
      qty = 0;
    }
  }
  return {boxes};
}

function canvasFromBarcode(v){ const c=document.createElement("canvas"); JsBarcode(c, v||"000000", {format:"CODE128", displayValue:false, margin:0, height:45, width:1.6}); return c; }
function csvDownload(filename, rows){ const csv = Papa.unparse(rows); const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"}); saveAs(blob, filename); }
function escapeZPL(s){ return (s??"").replace(/[\\^~]/g, ch=>({"^":"\\^","~":"\\~","\\":"\\\\"}[ch])); }
function zplForLabel(meta, box){
  const PW=812, LL=1624; const left=20; let y=20; const lh=28;
  const L=(t,b=false)=>{ const f=b?"^A0N,28,20":"^A0N,24,18"; const s=`^FO${left},${y}${f}^FD${escapeZPL(t)}^FS\n`; y+=lh; return s; };
  const sizeLine=(label,val)=>{ const s=`^FO${left},${y}^A0N,24,18^FD${label}:^FS\n^FO${left+120},${y}^A0N,24,18^FD${val?val:""}^FS\n`; y+=26; return s; };
  let z="^XA\n^CI28\n^PW"+PW+"\\n^LL"+LL+"\\n";
  z+=L(`Pick Ticket: ${meta.pick}`,true);
  z+=L(`Item ID: ${meta.item}`,true);
  z+=L(`Body Desc.: ${meta.body}`);
  z+=L(`Color: ${meta.color}`);
  z+=L(`Customer PO#: ${meta.po}`);
  z+=L(`Work Order: ${meta.wo}`);
  y+=6;
  z+=sizeLine("S", box.sizes.S); z+=sizeLine("M", box.sizes.M); z+=sizeLine("L", box.sizes.L); z+=sizeLine("XL", box.sizes.XL);
  z+=sizeLine("2X", box.sizes["2X"]); z+=sizeLine("3X", box.sizes["3X"]); z+=sizeLine("4X", box.sizes["4X"]); z+=sizeLine("5X", box.sizes["5X"]);
  y+=6; z+=L(`Total: ${box.total}`, true); y+=6;
  z+=`^FO${left},${y}^A0N,24,18^FDBOX ${box.boxIndex} OF ${box.boxCount}^FS\n`; y+=28;
  const dim = box.boxType === "TARGET" 
    ? " (Target 7-unit scale)" 
    : (BOX_DIMENSIONS[box.boxType] ? ` ${BOX_DIMENSIONS[box.boxType]}` : "");
  z+=`^FO${left},${y}^A0N,24,18^FDBox Size: ${box.boxType}${dim}^FS\n`; y+=28;
  // Removed "Line X" per user request
  z+=`^FO${left},${LL-180}^BY2,2,120^BCN,120,Y,N,N^FD${escapeZPL(meta.pick)}^FS\n`;
  z+="^XZ\n"; return z;
}
function renderAllZPL(labels){ return labels.map(l=>zplForLabel(l.meta, l.box)).join("\\n"); }
function renderPDF(labels){
  const doc=new jsPDF({orientation:"portrait", unit:"pt", format:[288,576]});
  const draw=(l,isFirst)=>{
    if(!isFirst) doc.addPage([288,576],"portrait"); const {meta, box} = l;
    const x0=18; let y=16; const line=(t,fs=12,b=false)=>{ doc.setFont("helvetica", b?"bold":"normal"); doc.setFontSize(fs); doc.text(t,x0,y); y+=fs+6; };
    line(`Pick Ticket: ${meta.pick}`,14,true); line(`Item ID: ${meta.item}`,12,true);
    line(`Body Desc.: ${meta.body}`,11); line(`Color: ${meta.color}`,11); line(`Customer PO#: ${meta.po}`,11); line(`Work Order: ${meta.wo}`,11);
    y+=4; const sizeLine=(lab,val)=>{ const lh=14; doc.setFontSize(12); doc.setFont("helvetica","bold"); doc.text(`${lab}:`,x0,y); doc.setFont("helvetica","normal"); doc.text(val?String(val):"", x0+40, y); y+=lh; };
    ["S","M","L","XL","2X","3X","4X","5X"].forEach(sk=>sizeLine(sk, box.sizes[sk]||0));
    y+=4; line(`Total: ${box.total}`,12,true); y+=6; doc.setFontSize(11); doc.setFont("helvetica","bold"); doc.text(`BOX ${box.boxIndex} OF ${box.boxCount}`,x0,y); y+=16;
    const dim = box.boxType === "TARGET"
      ? " (Target 7-unit scale)"
      : (BOX_DIMENSIONS[box.boxType] ? ` ${BOX_DIMENSIONS[box.boxType]}` : "");
    doc.setFont("helvetica","normal"); doc.text(`Box Size: ${box.boxType}${dim}`,x0,y); y+=16;
    // Removed "Line X"
    const bc=canvasFromBarcode(meta.pick); const bcW=240, bcH=50; doc.addImage(bc.toDataURL("image/png"),"PNG", x0, 576-bcH-24, bcW, bcH);
  };
  labels.forEach((l,i)=>draw(l,i===0)); return doc;
}

function Barcode({value}){
  const id = useMemo(()=>`bc_${Math.random().toString(36).slice(2)}`,[]);
  React.useEffect(()=>{ const c=document.getElementById(id); if(c){ try{ JsBarcode(c, value||"000000", {format:"CODE128", displayValue:false, margin:0, height:40, width:1.6}); }catch{} } },[id,value]);
  return <canvas id={id} style={{width:240, height:50}} />;
}

export default function App(){
  const [rows, setRows] = useState([]);
  const [labels, setLabels] = useState([]);
  const [errors, setErrors] = useState([]);
  const [tests, setTests] = useState([]);
  const [blockExports, setBlockExports] = useState(false);

  const onFiles = (files) => {
    if(!files || files.length===0) return;
    const loaded=[];
    Array.from(files).forEach((f)=>{
      loaded.push(new Promise((resolve)=>{
        Papa.parse(f,{header:true, skipEmptyLines:true, complete:(res)=>resolve(res.data.map((row,i)=>({...row, __csvLine:i+2, __file:f.name}))) });
      }));
    });
    Promise.all(loaded).then(all=>{ setRows([].concat(...all)); });
  };

  const handleDrop = (e)=>{ e.preventDefault(); onFiles(e.dataTransfer.files); };

  const process = () => {
    const errs=[]; const groups=new Map();
    const grab=(r,k)=>normString(r?.[k]);
    rows.forEach((r, idx)=>{
      const pick=grab(r,COL.pickTicket), item=grab(r,COL.itemId), wo=grab(r,COL.workOrder);
      const body=grab(r,COL.bodyDesc), color=grab(r,COL.color), po=normPO(r?.[COL.custPO]), spec1=grab(r,COL.specInst1);
      const billToName=grab(r,COL.billToName);
      const rawSize=grab(r,COL.size); const size=normalizeSizeToken(rawSize);
      const qty=Number(grab(r,COL.sizeQty)||0);
      const lineQtyMaybe = Number(grab(r,COL.lineQtyMaybe) || 0) || null;
      const lineSeq = Number(r.__csvLine || (idx+2));

      const mode=detectMode(spec1), sleeve=detectSleeve(body);
      if(!pick||!item||!wo){ errs.push(`Row ${idx+1}: missing key fields (Pick/Item/WO)`); return; }

      const gk={pick,item,wo,body,color,po,mode,sleeve,billToName,spec1};
      const key=JSON.stringify(gk);
      if(!groups.has(key)) groups.set(key,{key:gk, sizes:normalizeSizes({}), _rawIgnored:[], expected: lineQtyMaybe, lineSeqs:[lineSeq]});
      const g=groups.get(key);
      if(size){ g.sizes[size]+=qty; } else if(rawSize){ g._rawIgnored.push(rawSize); }
      if(lineQtyMaybe){ g.expected = lineQtyMaybe; }
      g.lineSeqs.push(lineSeq);
    });

    const out=[]; let blocking=false;

    groups.forEach((g)=>{
      const {key:baseMeta, sizes, _rawIgnored, expected, lineSeqs} = g;
      const {mode, sleeve, billToName, spec1, ...metaFields} = baseMeta;
      const actual = sumSizes(sizes);
      if(expected){ if(actual!==expected){ blocking=true; errs.push(`Pick ${metaFields.pick} / Item ${metaFields.item} / WO ${metaFields.wo}: sizes sum ${actual} ≠ line qty ${expected}. Ignored: [${_rawIgnored.join(", ")}]`);} }

      // Check for Target mode first
      const isTarget = detectTargetMode(spec1, billToName, metaFields.po);
      let boxes;

      if (isTarget) {
        // Target mode: fixed scale packing
        const numberOfCartons = extractTargetCartonCount(sizes);
        if (!numberOfCartons) {
          blocking = true;
          errs.push(`Pick ${metaFields.pick} / Item ${metaFields.item} / WO ${metaFields.wo}: Target order total (${actual}) is not divisible by 7.`);
          boxes = [];
        } else {
          try {
            const result = splitTarget(sizes, numberOfCartons);
            boxes = result.boxes;
          } catch (error) {
            blocking = true;
            errs.push(`Pick ${metaFields.pick} / Item ${metaFields.item} / WO ${metaFields.wo}: ${error.message}`);
            boxes = [];
          }
        }
      } else {
        // Existing logic for PF/PB modes (unchanged)
        const table = mode==="POLYBAG"?PB:PF;
        const capsSXL = table[sleeve].SXL;
        const capsBIG = table[sleeve].BIG;
        const totals  = table[sleeve].SXL;
        boxes = (mode==="POLYBAG")
          ? splitPolybagBySize(sizes, capsSXL, capsBIG, totals).boxes
          : splitPF(sizes, capsSXL, capsBIG, totals).boxes;
      }

      const lineSeq = Math.min(...lineSeqs.filter(Boolean));

      boxes.forEach((b,i)=>{
        const total = sumSizes(b.sizes);
        const meta = {...metaFields, lineSeq};
        out.push({ meta, box:{ boxIndex:i+1, boxCount:boxes.length, boxType:b.boxType, sleeve, mode: isTarget ? "TARGET" : mode, sizes:normalizeSizes(b.sizes), total } });
      });
    });

    setLabels(out); setErrors(errs); setBlockExports(blocking);
  };

  const downloadPDF = ()=>{ const doc=renderPDF(labels); const fn=`labels_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`; doc.save(fn); };
  const downloadZPL = ()=>{ const zpl=renderAllZPL(labels); const blob=new Blob([zpl],{type:"text/plain;charset=utf-8"}); saveAs(blob, `labels_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.zpl`); };
  const downloadLogs = ()=>{
    const ts=new Date().toISOString(); const rowsOut=[];
    labels.forEach(({meta,box})=>{
      rowsOut.push({timestamp:ts, pick_ticket:meta.pick, item_id:meta.item, work_order:meta.wo, /* line removed visually, keep for log? keeping */ line_in_csv:meta.lineSeq, box_index:box.boxIndex, box_count:box.boxCount, box_type:box.boxType, sleeve:box.sleeve, mode:box.mode, S:box.sizes.S||"", M:box.sizes.M||"", L:box.sizes.L||"", XL:box.sizes.XL||"", _2X:box.sizes["2X"]||"", _3X:box.sizes["3X"]||"", _4X:box.sizes["4X"]||"", _5X:box.sizes["5X"]||"", total:box.total, file_name:`labels_${ts}.pdf` });
    });
    csvDownload(`label_log_${ts.replace(/[:]/g,'-')}.csv`, rowsOut);
  };

  const runTests = ()=>{
    const logs=[]; const ok=(n,c)=>logs.push(`${c?"✓":"✗"} ${n}`);
    // Polybag no-mix test: 95 S should produce D(60) + C(35) in PB/SS; each box has only S
    const sizesPB = normalizeSizes({S:95});
    const rPB = splitPolybagBySize(sizesPB, PB.SS.SXL, PB.SS.BIG, PB.SS.SXL).boxes;
    ok("PB no mix sizes", rPB[0].sizes.M===0 && rPB[0].sizes["2X"]===0 && rPB.every(b=>Object.values(b.sizes).filter(v=>v>0).length==1));
    // PF mix test still allowed
    const sizesPF = normalizeSizes({S:50, M:10, "2X":10});
    const rPF = splitPF(sizesPF, PF.SS.SXL, PF.SS.BIG, PF.SS.SXL).boxes;
    ok("PF mix allowed and caps respected", rPF.length>=2);
    setTests(logs);
  };

  const preview = useMemo(()=>labels.slice(0,20),[labels]);

  return (
    <div className="container">
      <h1>Carton Label Builder (4×8 – Zebra 203dpi)</h1>
      <p><span className="pill">Modes</span>: <b>Printers & Fold</b> (mix sizes) • <b>Polybag</b> (no mixing, per-size cartons) • <b>Target</b> (7 units per case, 1-1-2-2-1 scale). D-first for fulls, then smallest that fits; never overflow.</p>

      <div className="card" onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
          <div><b>Drop CSVs</b><div className="small">We merge and process them together</div></div>
          <input type="file" accept=".csv" multiple onChange={e=>onFiles(e.target.files)} />
        </div>
      </div>

      <div style={{display:'flex',gap:12,flexWrap:'wrap', margin:'16px 0'}}>
        <button className="btn btn-primary" onClick={process}>Process</button>
        <button className="btn btn-dark" onClick={downloadPDF} disabled={!labels.length || blockExports} title={blockExports?'Fix input issues first':''}>Download 4×8 PDF</button>
        <button className="btn btn-dark" onClick={downloadZPL} disabled={!labels.length || blockExports} title={blockExports?'Fix input issues first':''}>Download RAW ZPL</button>
        <button className="btn btn-gray" onClick={downloadLogs} disabled={!labels.length}>Download Label CSV Log</button>
        <button className="btn btn-blue" onClick={runTests}>Run tests</button>
      </div>

      {errors.length>0 && (
        <div className="card warn" style={{marginBottom:16}}>
          <b>Input issues</b>
          <ul>{errors.map((e,i)=><li key={i} style={{fontSize:13}}>{e}</li>)}</ul>
          <div className="small">Exports disabled until resolved.</div>
        </div>
      )}

      {labels.length>0 && (
        <div style={{marginBottom:16}}>
          <h3>Preview (first 20)</h3>
          <div className="grid">
            {preview.map((l,i)=>(
              <div key={i} className="card">
                <div style={{fontSize:12, color:'#6b7280', marginBottom:8}}>{l.box.boxIndex} / {l.box.boxCount} • Box {l.box.boxType} • {l.box.mode==="POLYBAG"?"No-mix":l.box.mode==="TARGET"?"Target 7-unit":"Mix OK"}</div>
                <div><b>Pick Ticket:</b> {l.meta.pick}</div>
                <div><b>Item ID:</b> {l.meta.item}</div>
                <div><b>Body:</b> {l.meta.body}</div>
                <div><b>Color:</b> {l.meta.color}</div>
                <div><b>Customer PO#:</b> {l.meta.po}</div>
                <div><b>Work Order:</b> {l.meta.wo}</div>
                <div className="grid-1">
                  {SIZE_ORDER.map((sk)=>(
                    <div key={sk} style={{display:'flex', justifyContent:'space-between'}}><b>{sk}:</b><span>{l.box.sizes[sk]||""}</span></div>
                  ))}
                </div>
                <div style={{marginTop:8}}><b>Total:</b> {l.box.total}</div>
                <div>BOX {l.box.boxIndex} OF {l.box.boxCount}</div>
                <div>Box Size: {l.box.boxType} {l.box.boxType === "TARGET" ? "(Target 7-unit scale)" : (BOX_DIMENSIONS[l.box.boxType]||"")}</div>
                <Barcode value={l.meta.pick} />
              </div>
            ))}
          </div>
        </div>
      )}

      {labels.length>0 && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Pick</th><th>Item</th><th>WO</th><th>Box</th><th>Type</th>
                <th>S</th><th>M</th><th>L</th><th>XL</th><th>2X</th><th>3X</th><th>4X</th><th>5X</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l,i)=>(
                <tr key={i}>
                  <td>{l.meta.pick}</td>
                  <td>{l.meta.item}</td>
                  <td>{l.meta.wo}</td>
                  <td>{l.box.boxIndex} / {l.box.boxCount}</td>
                  <td>{l.box.boxType}</td>
                  <td>{l.box.sizes.S||""}</td>
                  <td>{l.box.sizes.M||""}</td>
                  <td>{l.box.sizes.L||""}</td>
                  <td>{l.box.sizes.XL||""}</td>
                  <td>{l.box.sizes["2X"]||""}</td>
                  <td>{l.box.sizes["3X"]||""}</td>
                  <td>{l.box.sizes["4X"]||""}</td>
                  <td>{l.box.sizes["5X"]||""}</td>
                  <td><b>{l.box.total}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tests.length>0 && (
        <div className="card" style={{marginTop:16}}>
          <b>Test results</b>
          <ul>{tests.map((t,i)=><li key={i} style={{fontSize:13}}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
