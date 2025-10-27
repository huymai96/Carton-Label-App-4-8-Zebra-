
import React, { useState, useMemo } from "react";
import Papa from "papaparse";
import saveAs from "file-saver";
import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";

const SIZE_ORDER = ["S","M","L","XL","2X","3X","4X","5X"];
const CAP_PRINTERS_FOLD = {
  SS: { SXL:{A:24,B:48,C:60,D:72}, BIG:{A:18,B:36,C:42,D:48} },
  LS: { SXL:{A:18,B:36,C:48,D:60}, BIG:{A:12,B:24,C:36,D:48} },
};
const CAP_POLYBAG = {
  SS: { SXL:{A:18,B:36,C:48,D:60}, BIG:{A:16,B:30,C:36,D:40} },
  LS: { SXL:{A:16,B:30,C:36,D:48}, BIG:{A:12,B:24,C:30,D:40} },
};
const BOX_DIMENSIONS = { A:"12x12x12", B:"9x16x22", C:"11x16x22", D:"13x16x24" };
const COL = {
  pickTicket:"PICK TICKET #", itemId:"ITEM ID", bodyDesc:"BODY DESCRIPTION", color:"COLOR",
  custPO:"CUST. PO NUMBER", workOrder:"WORK ORDER #", lineNo:"SALES ORDER LINE #",
  size:"SIZE", sizeQty:"SIZE NET ORDER QTY", specInst1:"SPEC INST DESCRIPTION 1", lineQtyMaybe:"NET ORDER QTY"
};
const DEFAULT_SELECT_SMALLEST_FIT = true;

function detectMode(spec){ if(!spec) return "PRINTERS_FOLD"; return /polybag/i.test(spec)?"POLYBAG":"PRINTERS_FOLD"; }
function detectSleeve(body){ if(!body) return "SS"; if(/\bLS\b|long\s*sleeve/i.test(body)) return "LS"; return "SS"; }
function getCapacity(mode,sleeve,band){ return (mode==="POLYBAG"?CAP_POLYBAG:CAP_PRINTERS_FOLD)[sleeve][band]; }
function normalizeSizes(m){ const out={S:0,M:0,L:0,XL:0,"2X":0,"3X":0,"4X":0,"5X":0}; SIZE_ORDER.forEach(k=>out[k]=Number(m?.[k]??0)); return out; }
function sumSizes(m){ return SIZE_ORDER.reduce((a,k)=>a+Number(m?.[k]??0),0); }
function pickSmallestBoxThatFits(q, caps){ for(const b of ["A","B","C","D"]) if(q<=caps[b]) return b; return "D"; }

function splitByCapacityInOrder(sizes, capsSXL, capsBIG){
  const rem = {...sizes}; const boxes=[];
  while(sumSizes(rem)>0){
    const combined={A:capsSXL.A+capsBIG.A,B:capsSXL.B+capsBIG.B,C:capsSXL.C+capsBIG.C,D:capsSXL.D+capsBIG.D};
    const chunkTarget = Math.min(sumSizes(rem), combined.D);
    const boxType = DEFAULT_SELECT_SMALLEST_FIT ? pickSmallestBoxThatFits(chunkTarget, combined) : "D";
    const capSXL=capsSXL[boxType], capBIG=capsBIG[boxType];
    const out=normalizeSizes({}); let usedSXL=0, usedBIG=0;
    const push=(key,band)=>{ const cap=band==="SXL"?capSXL:capBIG; const left=cap - (band==="SXL"?usedSXL:usedBIG);
      const take=Math.min(rem[key], Math.max(0,left)); if(take>0){ out[key]+=take; rem[key]-=take; if(band==="SXL") usedSXL+=take; else usedBIG+=take; }};
    ["S","M","L","XL"].forEach(k=>push(k,"SXL")); ["2X","3X","4X","5X"].forEach(k=>push(k,"BIG"));
    if(sumSizes(out)===0){ const k=SIZE_ORDER.find(k=>rem[k]>0); out[k]=1; rem[k]-=1; }
    boxes.push({boxType, sizes: out});
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
  const dim = BOX_DIMENSIONS[box.boxType] ? ` ${BOX_DIMENSIONS[box.boxType]}` : "";
  z+=`^FO${left},${y}^A0N,24,18^FDBox Size: ${box.boxType}${dim}^FS\n`; y+=28;
  z+=`^FO${left},${y}^A0N,24,18^FDLine 1^FS\n`; y+=32;
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
    const dim = BOX_DIMENSIONS[box.boxType] ? ` ${BOX_DIMENSIONS[box.boxType]}` : ""; doc.setFont("helvetica","normal"); doc.text(`Box Size: ${box.boxType}${dim}`,x0,y); y+=16;
    doc.text(`Line 1`, x0, y); y+=14; const bc=canvasFromBarcode(meta.pick); const bcW=240, bcH=50; doc.addImage(bc.toDataURL("image/png"),"PNG", x0, 576-bcH-24, bcW, bcH);
  };
  labels.forEach((l,i)=>draw(l,i===0)); return doc;
}

function Barcode({value}){
  const id = useMemo(()=>`bc_${Math.random().toString(36).slice(2)}`,[]);
  React.useEffect(()=>{ const c=document.getElementById(id); if(c){ try{ JsBarcode(c, value||"000000", {format:"CODE128", displayValue:false, margin:0, height:40, width:1.6}); }catch{}} },[id,value]);
  return <canvas id={id} style={{width:240, height:50}} />;
}

export default function App(){
  const [rows, setRows] = useState([]);
  const [labels, setLabels] = useState([]);
  const [errors, setErrors] = useState([]);
  const [tests, setTests] = useState([]);

  const onFiles = (files) => {
    if(!files || files.length===0) return;
    const loaded=[];
    Array.from(files).forEach(f=>{
      loaded.push(new Promise(resolve=>{
        Papa.parse(f,{header:true, skipEmptyLines:true, complete:(res)=>resolve(res.data)});
      }));
    });
    Promise.all(loaded).then(all=>{ setRows([].concat(...all)); });
  };

  const handleDrop = (e)=>{ e.preventDefault(); onFiles(e.dataTransfer.files); };

  const process = () => {
    const errs=[]; const groups=new Map();
    const grab=(r,k)=>(r?.[k]??"").toString().trim();
    rows.forEach((r, idx)=>{
      const pick=grab(r,COL.pickTicket), item=grab(r,COL.itemId), wo=grab(r,COL.workOrder), line=grab(r,COL.lineNo);
      const body=grab(r,COL.bodyDesc), color=grab(r,COL.color), po=grab(r,COL.custPO), spec1=grab(r,COL.specInst1);
      const size=grab(r,COL.size).toUpperCase(); const qty=Number(grab(r,COL.sizeQty)||0);
      const mode=detectMode(spec1), sleeve=detectSleeve(body);
      if(!pick||!item||!wo){ errs.push(`Row ${idx+1}: missing key fields (Pick/Item/WO)`); return; }
      const gk={pick,item,wo,line,body,color,po}; const key=JSON.stringify(gk);
      if(!groups.has(key)) groups.set(key,{key:gk, sizes:normalizeSizes({}), mode, sleeve, body, color, po});
      const g=groups.get(key);
      if(SIZE_ORDER.includes(size)) g.sizes[size]+=qty;
    });
    const out=[];
    groups.forEach(({key:s, sizes, mode, sleeve})=>{
      const sxl=getCapacity(mode,sleeve,"SXL"); const big=getCapacity(mode,sleeve,"BIG");
      const {boxes} = splitByCapacityInOrder(sizes, sxl, big);
      boxes.forEach((b,i)=>{
        const total = sumSizes(b.sizes);
        out.push({ meta:s, box:{ boxIndex:i+1, boxCount:boxes.length, boxType:b.boxType, sleeve, mode, sizes:normalizeSizes(b.sizes), total } });
      });
    });
    setLabels(out); setErrors(errs);
  };

  const downloadPDF = ()=>{ const doc=renderPDF(labels); const fn=`labels_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`; doc.save(fn); };
  const downloadZPL = ()=>{ const zpl=renderAllZPL(labels); const blob=new Blob([zpl],{type:"text/plain;charset=utf-8"}); saveAs(blob, `labels_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.zpl`); };
  const downloadLogs = ()=>{
    const ts=new Date().toISOString(); const rowsOut=[];
    labels.forEach(({meta,box})=>{
      rowsOut.push({timestamp:ts, pick_ticket:meta.pick, item_id:meta.item, work_order:meta.wo, line:meta.line, box_index:box.boxIndex, box_count:box.boxCount, box_type:box.boxType, sleeve:box.sleeve, mode:box.mode, S:box.sizes.S||"", M:box.sizes.M||"", L:box.sizes.L||"", XL:box.sizes.XL||"", _2X:box.sizes["2X"]||"", _3X:box.sizes["3X"]||"", _4X:box.sizes["4X"]||"", _5X:box.sizes["5X"]||"", total:box.total, file_name:`labels_${ts}.pdf` });
    });
    csvDownload(`label_log_${ts.replace(/[:]/g,'-')}.csv`, rowsOut);
  };

  const runTests = ()=>{
    const logs=[]; const ok=(n,c)=>logs.push(`${c?"✓":"✗"} ${n}`);
    ok("detectMode polybag", detectMode("POLYBAG EACH") === "POLYBAG"); ok("detectMode printers fold", detectMode("") === "PRINTERS_FOLD");
    ok("detectSleeve LS", detectSleeve("A/LS TEE")==="LS"); ok("detectSleeve SS", detectSleeve("A/SS TEE")==="SS");
    ok("cap SS SXL A == 24", CAP_PRINTERS_FOLD.SS.SXL.A === 24);
    const sizes1=normalizeSizes({S:30,M:10}); const b1=splitByCapacityInOrder(sizes1, CAP_PRINTERS_FOLD.SS.SXL, CAP_PRINTERS_FOLD.SS.BIG).boxes;
    ok("sum preserved", b1.reduce((a,b)=>a+sumSizes(b.sizes),0)===40);
    const dummyMeta={pick:"12345", item:"ABCD", wo:"WO1", line:"1", body:"A/SS TEE", color:"BLACK", po:"PO1"};
    const dummyBox={boxIndex:1,boxCount:1,boxType:"A",sleeve:"SS",mode:"PRINTERS_FOLD",sizes:normalizeSizes({S:1}),total:1};
    const z=zplForLabel(dummyMeta,dummyBox); ok("zpl contains ^XA/^XZ", z.includes("^XA")&&z.includes("^XZ"));
    setTests(logs);
  };

  const preview = useMemo(()=>labels.slice(0,20),[labels]);

  return (
    <div className="container">
      <h1>Carton Label Builder (4×8 – Zebra 203dpi)</h1>
      <p>Multi-CSV upload, preview, and export PDF or RAW ZPL. Logs exportable to CSV.</p>

      <div className="card" onDrop={handleDrop} onDragOver={e=>e.preventDefault()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
          <div><b>Drag & drop multiple CSVs</b><div style={{fontSize:12, color:'#6b7280'}}>We merge and process them together</div></div>
          <input type="file" accept=".csv" multiple onChange={e=>onFiles(e.target.files)} />
        </div>
      </div>

      <div style={{display:'flex',gap:12,flexWrap:'wrap', margin:'16px 0'}}>
        <button className="btn btn-primary" onClick={process}>Process</button>
        <button className="btn btn-dark" onClick={downloadPDF} disabled={!labels.length}>Download 4×8 PDF</button>
        <button className="btn btn-dark" onClick={downloadZPL} disabled={!labels.length}>Download RAW ZPL</button>
        <button className="btn btn-gray" onClick={downloadLogs} disabled={!labels.length}>Download Label CSV Log</button>
        <button className="btn btn-blue" onClick={runTests}>Run built‑in tests</button>
      </div>

      {errors.length>0 && (
        <div className="card" style={{borderColor:'#fbbf24', background:'#fffbeb', marginBottom:16}}>
          <b>Input issues</b>
          <ul>{errors.map((e,i)=><li key={i} style={{fontSize:13}}>{e}</li>)}</ul>
        </div>
      )}

      {labels.length>0 && (
        <div style={{marginBottom:16}}>
          <h3>Visual preview (first 20 labels)</h3>
          <div className="grid">
            {preview.map((l,i)=>(
              <div key={i} className="card">
                <div style={{fontSize:12, color:'#6b7280', marginBottom:8}}>{l.box.boxIndex} / {l.box.boxCount} • Box {l.box.boxType}</div>
                <div><b>Pick Ticket:</b> {l.meta.pick}</div>
                <div><b>Item ID:</b> {l.meta.item}</div>
                <div><b>Body:</b> {l.meta.body}</div>
                <div><b>Color:</b> {l.meta.color}</div>
                <div><b>Customer PO#:</b> {l.meta.po}</div>
                <div><b>Work Order:</b> {l.meta.wo}</div>
                <div className="grid-1">
                  {SIZE_ORDER.map(sk=>(
                    <div key={sk} style={{display:'flex', justifyContent:'space-between'}}><b>{sk}:</b><span>{l.box.sizes[sk]||""}</span></div>
                  ))}
                </div>
                <div style={{marginTop:8}}><b>Total:</b> {l.box.total}</div>
                <div>BOX {l.box.boxIndex} OF {l.box.boxCount}</div>
                <div>Box Size: {l.box.boxType} {BOX_DIMENSIONS[l.box.boxType]||""}</div>
                <div>Line 1</div>
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
                <th>Pick</th><th>Item</th><th>WO</th><th>Line</th><th>Box</th><th>Type</th>
                <th>S</th><th>M</th><th>L</th><th>XL</th><th>2X</th><th>3X</th><th>4X</th><th>5X</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((l,i)=>(
                <tr key={i}>
                  <td>{l.meta.pick}</td>
                  <td>{l.meta.item}</td>
                  <td>{l.meta.wo}</td>
                  <td>{l.meta.line}</td>
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
