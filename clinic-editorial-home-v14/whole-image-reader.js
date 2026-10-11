function installWholeImageReader() {
  const triggers = [...document.querySelectorAll('[data-image-open]')];
  if (!triggers.length) return;
  const make = (tag, text, attrs = {}) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    for (const [key,value] of Object.entries(attrs)) element.setAttribute(key,String(value));
    return element;
  };
  const dialog = make('dialog',null,{class:'image-reader','aria-labelledby':'image-reader-title'});
  const title = make('h2','圖文放大閱讀',{id:'image-reader-title'});
  const close = make('button','關閉',{type:'button',class:'reader-close'});
  const header = make('div',null,{class:'reader-header'});header.append(title,close);
  const fit = make('button','完整圖',{type:'button'});
  const minus = make('button','縮小',{type:'button','aria-label':'縮小圖片'});
  const plus = make('button','放大',{type:'button','aria-label':'放大圖片'});
  const value = make('output','100%',{'aria-live':'polite'});
  const tools = make('div',null,{class:'reader-tools','aria-label':'圖片縮放'});tools.append(fit,minus,value,plus);
  const viewport = make('div',null,{class:'reader-viewport',tabindex:'0','aria-label':'完整圖文，可捲動查看放大內容'});
  const image = make('img',null,{class:'reader-image',alt:''});viewport.append(image);
  const status = make('p','',{class:'reader-status',role:'status'});
  dialog.append(header,tools,viewport,status);document.body.append(dialog);
  let scale=1,base=0,lastTrigger;
  function resize(next){scale=Math.max(1,Math.min(4,next));image.style.width=Math.round(base*scale)+'px';value.textContent=Math.round(scale*100)+'%';minus.disabled=scale===1;plus.disabled=scale===4;}
  fit.addEventListener('click',()=>{resize(1);viewport.scrollTo(0,0);});
  minus.addEventListener('click',()=>resize(scale-.5));
  plus.addEventListener('click',()=>resize(scale+.5));
  close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>lastTrigger?.focus());
  image.addEventListener('error',()=>{status.textContent='圖片暫時無法載入，請關閉後再試一次。';});
  for(const trigger of triggers)trigger.addEventListener('click',()=>{
    const source=trigger.closest('figure').querySelector('img');lastTrigger=trigger;
    title.textContent=source.alt;status.textContent='放大後，可左右、上下捲動查看完整圖文。';
    image.src=source.currentSrc||source.src;image.alt=source.alt;
    image.width=source.naturalWidth||Number(source.getAttribute('width'));
    image.height=source.naturalHeight||Number(source.getAttribute('height'));
    dialog.showModal();base=viewport.clientWidth;resize(1);viewport.scrollTo(0,0);close.focus();
    document.dispatchEvent(new Event('whole-image-open'));
  });
}
installWholeImageReader();
