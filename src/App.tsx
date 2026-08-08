import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleUser, Copy, Gauge, Gem, Image as ImageIcon, Instagram, Loader2, LogOut, MapPin, Menu, MessageCircle, Minus, Moon, Package, Pencil, Plus, Search, ShoppingBag, Sparkles, Sun, Trash2, TrendingUp, Truck, X } from 'lucide-react';
import { BRAND, SOCIAL, whatsappUrl, isExternalHref, categoryImageUrl, DEFAULT_HERO_ASSETS } from './lib/brand';
import { I18nProvider, useI18n } from './i18n/Context';
import { useCart, type Product } from './contexts/CartContext';
import { useAuth } from './contexts/AuthContext';
import supabase from './lib/supabase';

// ── Theme (single source of truth) ─────────────────────
type ThemeMode = 'light' | 'dark';
const ThemeContext = createContext<{ theme: ThemeMode; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
});
function readStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('ks-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* private mode */ }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}
function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('ks-theme', theme); } catch { /* private mode */ }
}
function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const initial = readStoredTheme();
    if (typeof document !== 'undefined') applyTheme(initial);
    return initial;
  });
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggle = () => setTheme((t) => {
    const next = t === 'light' ? 'dark' : 'light';
    applyTheme(next);
    return next;
  });
  const value = useMemo(() => ({ theme, toggle }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
function useThemeMode() {
  return useContext(ThemeContext);
}
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const API_TIMEOUT_MS=20000;
async function api(path:string, options?:RequestInit){
  const controller=new AbortController();
  const timeoutId=setTimeout(()=>controller.abort(),API_TIMEOUT_MS);
  try{
    const r=await fetch(path,{...options,signal:controller.signal});
    const text=await r.text();
    let d:any=null;
    try{d=text?JSON.parse(text):null}catch{throw new Error(r.ok?'Invalid server response':'Something went wrong')}
    if(!r.ok){
      const err:any=new Error(d?.error||'Something went wrong');
      if(d?.code)err.code=d.code;
      throw err;
    }
    return d;
  }catch(e:any){
    if(e?.name==='AbortError')throw new Error('Request timed out. Please try again.');
    throw e;
  }finally{
    clearTimeout(timeoutId);
  }
}
/** Same inventory levels as api/ranking.js — Healthy=1, Low=2, Out=3 */
function resolveStockPriority(p:{stock_quantity?:number;low_stock_threshold?:number;stockPriority?:number}){
  if(p.stockPriority===1||p.stockPriority===2||p.stockPriority===3)return p.stockPriority;
  const qty=p.stock_quantity??0;
  const threshold=p.low_stock_threshold??5;
  if(qty===0)return 3;
  if(qty<=threshold)return 2;
  return 1;
}
function InventoryBadge({p}:{p:Product}){
  const {t}=useI18n();
  const level=resolveStockPriority(p);
  const label=level===1?t('product.inStock'):level===2?t('product.limitedStock'):t('product.outOfStock');
  const tone=level===1?'ok':level===2?'low':'out';
  return <span className={`inventory-badge tone-${tone}`}>{label}</span>;
}
function Toast({text,onClose,tone='ok'}:{text:string;onClose:()=>void;tone?:'ok'|'err'|'info'}){
  useEffect(()=>{const t=setTimeout(onClose,tone==='info'?3200:2600);return()=>clearTimeout(t)},[onClose,tone]);
  return <motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} exit={{y:20,opacity:0}} className={`toast toast-${tone}`} role="status" aria-live="polite">
    {tone==='err'?<X size={16}/>:tone==='info'?<Loader2 size={16} className="spin"/>:<Check size={16}/>}{text}
  </motion.div>;
}
function ProductImage({src,alt,className=''}:{src?:string;alt:string;className?:string}){
  const [failed,setFailed]=useState(!src);
  const {t}=useI18n();
  if(!src||failed){
    return <div className={`img-ph ${className}`} role="img" aria-label={alt||t('common.imageUnavailable')}><ImageIcon size={28}/></div>;
  }
  return <img src={src} alt={alt} className={className} loading="lazy" onError={()=>setFailed(true)}/>;
}
function BrandMark({className='',to='/'}:{className?:string;to?:string}){
  const slogan=(BRAND.slogan||'').trim();
  return <Link to={to} className={`brand ${className}${slogan?' has-slogan':''}`} aria-label={BRAND.fullName}>
    <span className="brand-line">
      <span className="brand-main">{BRAND.name}</span>
      <span className="brand-accent">{BRAND.nameAccent}</span>
    </span>
    {slogan?<span className="brand-slogan">{slogan}</span>:null}
  </Link>;
}
function TikTokIcon({size=18}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.73a8.19 8.19 0 0 0 4.76 1.52V6.84a4.84 4.84 0 0 1-1-.15z"/></svg>;
}
function SocialLinks({className=''}:{className?:string}){
  const {t}=useI18n();
  return <div className={`social-links ${className}`}>
    <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" aria-label={t('footer.whatsapp')}><MessageCircle size={18}/></a>
    <a href={SOCIAL.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label={t('footer.instagram')}><Instagram size={18}/></a>
    <a href={SOCIAL.tiktokUrl} target="_blank" rel="noopener noreferrer" aria-label={t('footer.tiktok')}><TikTokIcon/></a>
  </div>;
}
function SmartLink({to,className,children}:{to:string;className?:string;children:React.ReactNode}){
  const href=to||'/shop';
  if(isExternalHref(href)){
    const url=/^wa\.me\//i.test(href)?`https://${href}`:href;
    return <a className={className} href={url} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link className={className} to={href}>{children}</Link>;
}
function Header(){
  const {count}=useCart();
  const [open,setOpen]=useState(false);
  const [cats,setCats]=useState<any[]>([]);
  const {t, lang, setLang}=useI18n();
  const {theme, toggle}=useThemeMode();
  useEffect(()=>{api('/api/categories').then(setCats).catch(()=>{})},[]);
  // Icon shows current mode: Sun = light (click → dark), Moon = dark (click → light)
  const ThemeIcon = theme === 'light' ? Sun : Moon;
  const themeLabel = theme === 'light' ? t('header.themeDark') : t('header.themeLight');
  return <header className="header">
    <BrandMark/>
    <nav className={open?'nav open':'nav'}>
      <Link to="/" onClick={()=>setOpen(false)}>{t('nav.home')}</Link>
      <Link to="/shop" onClick={()=>setOpen(false)}>{t('nav.catalog')}</Link>
      {cats.map(c=><Link key={c.id} to={`/shop?category=${c.id}`} onClick={()=>setOpen(false)}>{c.name}</Link>)}
    </nav>
    <div className="head-actions">
      <SocialLinks className="header-social"/>
      <button type="button" className="head-icon head-lang" onClick={()=>setLang(lang==='fr'?'en':'fr')} aria-label={t('header.lang')}>{lang.toUpperCase()}</button>
      <button type="button" className="head-icon" onClick={toggle} aria-label={themeLabel} title={themeLabel}><ThemeIcon/></button>
      <Link to="/cart" className="head-icon bag" aria-label={t('header.cart')}><ShoppingBag/><b aria-hidden="true">{count}</b></Link>
      <button type="button" className="head-icon menu" onClick={()=>setOpen(!open)} aria-label={t('header.menu')} aria-expanded={open}>{open?<X/>:<Menu/>}</button>
    </div>
  </header>
}
function Footer(){
  const {t}=useI18n();
  return <footer>
    <div>
      <BrandMark className="inverse"/>
      <p>{t('footer.description')}</p>
      <SocialLinks className="footer-social"/>
    </div>
    <div>
      <b>{t('footer.shopTitle')}</b>
      <Link to="/shop">{t('footer.viewCatalog')}</Link>
    </div>
    <div>
      <b>{t('footer.contactTitle')}</b>
      <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">{t('footer.whatsapp')}</a>
      <a href={SOCIAL.instagramUrl} target="_blank" rel="noopener noreferrer">{t('footer.instagram')}</a>
      <a href={SOCIAL.tiktokUrl} target="_blank" rel="noopener noreferrer">{t('footer.tiktok')}</a>
      <a href={`mailto:${SOCIAL.email}`}>{t('footer.email')}</a>
    </div>
    <small>{t('footer.copyright')}</small>
  </footer>;
}
function Layout({children}:{children:React.ReactNode}){
  const {t}=useI18n();
  return <><Header/><main>{children}</main><Footer/><a className="float-wa" href={whatsappUrl()} target="_blank" rel="noopener noreferrer" aria-label={t('footer.whatsapp')}><MessageCircle/></a></>;
}
function buildDefaultHeroSlides(t:(key:string)=>any){
  return DEFAULT_HERO_ASSETS.map(asset=>({
    ...asset,
    title:t(`home.heroDefaults.${asset.key}.title`),
    subtitle:t(`home.heroDefaults.${asset.key}.subtitle`),
    cta_label:t(`home.heroDefaults.${asset.key}.cta`),
  }));
}
function HeroSlider(){
  const [slides,setSlides]=useState<any[]>([]);
  const [mode,setMode]=useState<'loading'|'ready'|'fallback'|'empty'>('loading');
  const [index,setIndex]=useState(0);
  const [paused,setPaused]=useState(false);
  const touchX=useRef<number|null>(null);
  const {t,lang}=useI18n();

  useEffect(()=>{
    let cancelled=false;
    api('/api/hero').then((data)=>{
      if(cancelled)return;
      if(Array.isArray(data) && data.length){
        setSlides(data);
        setIndex(0);
        setMode('ready');
        return;
      }
      // Empty or unexpected payload — keep homepage alive with branded empty state
      setSlides([]);
      setMode('empty');
    }).catch(()=>{
      if(cancelled)return;
      try{
        setSlides(buildDefaultHeroSlides(t));
        setIndex(0);
        setMode('fallback');
      }catch{
        setSlides([]);
        setMode('empty');
      }
    });
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    if(mode==='fallback')setSlides(buildDefaultHeroSlides(t));
  },[lang,mode,t]);

  useEffect(()=>{
    if(paused||slides.length<=1||mode==='empty'||mode==='loading')return;
    const id=setInterval(()=>setIndex(i=>(i+1)%slides.length),5500);
    return()=>clearInterval(id);
  },[paused,slides.length,mode]);

  if(mode==='loading')return <section className="hero hero-slider hero-loading" aria-hidden="true"/>;
  if(mode==='empty'){
    return <section className="hero hero-slider hero-empty">
      <div className="hero-content">
        <p className="eyebrow gold">{BRAND.fullName}</p>
        <h1>{t('home.heroEmptyTitle')}</h1>
        <p className="hero-sub">{t('home.heroEmptySub')}</p>
        <Link className="btn gold-btn" to="/shop">{t('home.exploreBtn')} <ArrowRight/></Link>
      </div>
    </section>;
  }

  const go=(dir:number)=>setIndex(i=>(i+dir+slides.length)%slides.length);
  const slide=slides[index]||slides[0];
  if(!slide)return null;

  return (
    <section
      className="hero hero-slider"
      onMouseEnter={()=>setPaused(true)}
      onMouseLeave={()=>setPaused(false)}
      onFocusCapture={()=>setPaused(true)}
      onBlurCapture={()=>setPaused(false)}
      onTouchStart={(e)=>{touchX.current=e.touches[0].clientX;setPaused(true)}}
      onTouchEnd={(e)=>{
        if(touchX.current==null)return;
        const dx=e.changedTouches[0].clientX-touchX.current;
        if(Math.abs(dx)>40)go(dx<0?1:-1);
        touchX.current=null;
        setPaused(false);
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id||index}
          className="hero-slide"
          initial={{opacity:0,scale:1.04}}
          animate={{opacity:1,scale:1}}
          exit={{opacity:0}}
          transition={{duration:0.9,ease:[0.22,1,0.36,1]}}
          style={{backgroundImage:`linear-gradient(105deg,rgba(5,5,4,.78) 0%,rgba(5,5,4,.35) 48%,rgba(5,5,4,.15) 100%),url(${slide.image_url})`}}
        />
      </AnimatePresence>
      <div className="hero-content">
        <p className="eyebrow gold">{BRAND.fullName}</p>
        {slide.title?<motion.h1 key={`t-${slide.id||index}`} initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:0.15}}>{slide.title}</motion.h1>:null}
        {slide.subtitle?<motion.p key={`s-${slide.id||index}`} className="hero-sub" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:0.25}}>{slide.subtitle}</motion.p>:null}
        {(slide.cta_label||slide.cta_href)?(
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.35}}>
            <SmartLink className="btn gold-btn" to={slide.cta_href||'/shop'}>{slide.cta_label||t('home.exploreBtn')} <ArrowRight/></SmartLink>
          </motion.div>
        ):null}
      </div>
      {slides.length>1&&<>
        <button className="hero-nav prev" onClick={()=>go(-1)} aria-label={t('home.heroPrev')}><ChevronLeft/></button>
        <button className="hero-nav next" onClick={()=>go(1)} aria-label={t('home.heroNext')}><ChevronRight/></button>
        <div className="hero-dots" role="tablist" aria-label={t('home.heroDots')}>
          {slides.map((s:any,i:number)=>(
            <button key={s.id||i} className={i===index?'active':''} onClick={()=>setIndex(i)} aria-label={`${t('home.heroSlideLabel')} ${i+1}`}/>
          ))}
        </div>
      </>}
    </section>
  );
}
function CategoryStrip({cats}:{cats:any[]}){
  const {t}=useI18n();
  if(!cats.length)return null;
  return <section className="category-strip">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('home.categoriesSub')}</p>
        <h2>{t('home.categoriesTitle')}</h2>
      </div>
      <Link to="/shop">{t('home.viewAll')} <ArrowRight/></Link>
    </div>
    <div className="category-grid">
      {cats.map(c=>(
        <Link key={c.id} to={`/shop?category=${c.id}`} className="category-card">
          <img src={categoryImageUrl(c)} alt={c.name} loading="lazy"/>
          <div>
            <span className="eyebrow gold">{BRAND.nameAccent}</span>
            <h3>{c.name}</h3>
          </div>
        </Link>
      ))}
    </div>
  </section>;
}
function ProductCard({p,onAdded}:{p:Product;onAdded?:()=>void}){
  const {add}=useCart();
  const {t}=useI18n();
  const level=resolveStockPriority(p);
  const trackCart = () => {
    api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);
  };
  return <article className="product-card">
    <Link to={`/product/${p.slug}`} className="product-image">
      <ProductImage src={p.images?.[0]} alt={p.name}/>
      <InventoryBadge p={p}/>
    </Link>
    <div>
      <p className="eyebrow">{p.category?.name||BRAND.fullName}</p>
      <Link to={`/product/${p.slug}`}><h3>{p.name}</h3></Link>
      <p>{p.short_description}</p>
      <div className="product-row">
        <strong>{money(p.price)}</strong>
        <button type="button" onClick={()=>{add(p);trackCart();onAdded?.()}} disabled={level===3} aria-label={t('product.addToCart')}><Plus/> {t('product.addBtn')}</button>
      </div>
    </div>
  </article>
}
function Home(){
  const [products,setProducts]=useState<Product[]>([]);
  const [cats,setCats]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const {t}=useI18n();
  const load=()=>{
    setLoading(true);setError('');
    Promise.all([api('/api/products'),api('/api/categories')])
      .then(([p,c])=>{setProducts(p);setCats(c)})
      .catch(()=>setError(t('home.loadError')))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[]);
  const featured=products.filter(p=>!!p.featured);
  const trending=[...products]
    .filter(p=>(p.trendingScore||0)>0)
    .sort((a,b)=>b.trendingScore-a.trendingScore||(b.purchase_count||0)-(a.purchase_count||0))
    .slice(0,4);
  const bestSellers=[...products]
    .filter(p=>(p.purchase_count||0)>0)
    .sort((a,b)=>(b.purchase_count||0)-(a.purchase_count||0)||(b.trendingScore||0)-(a.trendingScore||0))
    .slice(0,4);
  const arrivals=products.filter(p=>p.isNewArrival).slice(0,4);
  
  return <Layout>
    <HeroSlider/>
    {loading?<Loading/>:error?<Empty text={error} action={<button type="button" className="btn dark-btn" onClick={load}>{t('common.retry')}</button>}/>:<>
      <CategoryStrip cats={cats}/>
      {featured.length>0&&<ProductSection title={t('home.featuredTitle')} subtitle={t('home.featuredSub')} products={featured} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {trending.length>0&&<ProductSection title={t('home.trendingTitle')} subtitle={t('home.trendingSub')} products={trending} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {bestSellers.length>0&&<ProductSection title={t('home.bestSellersTitle')} subtitle={t('home.bestSellersSub')} products={bestSellers} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {arrivals.length>0&&<ProductSection title={t('home.newArrivalsTitle')} subtitle={t('home.newArrivalsSub')} products={arrivals} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      <section className="simple-contact">
        <div>
          <p className="eyebrow gold">{t('home.personalService')}</p>
          <h2>{t('home.questionsTitle')}</h2>
          <p>{t('home.questionsDesc')}</p>
          <SocialLinks className="contact-social"/>
        </div>
        <a href={whatsappUrl()} className="btn gold-btn" target="_blank" rel="noopener noreferrer"><MessageCircle/> {t('home.contactWhatsApp')}</a>
      </section>
    </>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function ProductSection({title,subtitle,products,onAdded}:{title:string;subtitle:string;products:Product[];onAdded:()=>void}){const {t}=useI18n();return <section className="products-section"><div className="section-head"><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><Link to="/shop">{t('home.viewAll')} <ArrowRight/></Link></div><div className="product-grid">{products.map(p=><ProductCard key={p.id} p={p} onAdded={onAdded}/>)}</div></section>}
function Loading(){const {t}=useI18n();return <div className="loading" role="status" aria-live="polite" aria-label={t('common.loading')}><Loader2 className="spin" aria-hidden="true"/></div>}
function Shop(){
  const [products,setProducts]=useState<Product[]>([]);
  const [cats,setCats]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [q,setQ]=useState('');
  const [searchParams,setSearchParams]=useSearchParams();
  const cat=searchParams.get('category')||'all';
  const [sort,setSort]=useState('ranking');
  const [toast,setToast]=useState('');
  const {t}=useI18n();

  const load=()=>{
    setLoading(true);setError('');
    Promise.all([api('/api/products'),api('/api/categories')])
      .then(([p,c])=>{setProducts(p);setCats(c)})
      .catch(()=>setError(t('shop.loadError')))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[]);

  const selectCat=(id:string)=>{
    if(id==='all')setSearchParams({});
    else setSearchParams({category:id});
  };
  
  let filtered=products.filter(p=>(cat==='all'||String(p.category_id)===cat)&&p.name.toLowerCase().includes(q.toLowerCase()));
  if(sort==='trending') filtered.sort((a,b)=>b.trendingScore-a.trendingScore);
  else if(sort==='best') filtered.sort((a,b)=>b.purchase_count-a.purchase_count);
  else if(sort==='newest') filtered.sort((a,b)=>new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if(sort==='price-asc') filtered.sort((a,b)=>a.price-b.price);
  else if(sort==='price-desc') filtered.sort((a,b)=>b.price-a.price);
  else if(sort==='availability') filtered.sort((a,b)=>resolveStockPriority(a)-resolveStockPriority(b));
  else if(sort==='az') filtered.sort((a,b)=>a.name.localeCompare(b.name));

  return <Layout>
    <section className="page-hero">
      <p className="eyebrow gold">{t('shop.eyebrow')}</p>
      <h1>{t('shop.title')}</h1>
    </section>
    <section className="catalog">
      <div className="filters">
        <label className="search-field"><span className="sr-only">{t('shop.search')}</span><Search aria-hidden="true"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('shop.search')}/></label>
        <div className="sort-field">
          <label htmlFor="shop-sort">{t('shop.sortLabel')}</label>
          <select id="shop-sort" value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="ranking">{t('shop.sortOptions.ranking')}</option>
            <option value="trending">{t('shop.sortOptions.trending')}</option>
            <option value="best">{t('shop.sortOptions.best')}</option>
            <option value="newest">{t('shop.sortOptions.newest')}</option>
            <option value="price-asc">{t('shop.sortOptions.price-asc')}</option>
            <option value="price-desc">{t('shop.sortOptions.price-desc')}</option>
            <option value="availability">{t('shop.sortOptions.availability')}</option>
            <option value="az">{t('shop.sortOptions.az')}</option>
          </select>
        </div>
        <div className="filter-chips" role="group" aria-label={t('shop.eyebrow')}>
          <button type="button" className={cat==='all'?'active':''} onClick={()=>selectCat('all')}>{t('shop.categoryAll')}</button>
          {cats.map(c=><button type="button" key={c.id} className={cat===String(c.id)?'active':''} onClick={()=>selectCat(String(c.id))}>{c.name}</button>)}
        </div>
      </div>
      {loading?<Loading/>:error?<Empty text={error} action={<button type="button" className="btn dark-btn" onClick={load}>{t('common.retry')}</button>}/>:filtered.length?<div className="product-grid">{filtered.map(p=><ProductCard key={p.id} p={p} onAdded={()=>setToast(t('home.addedToBag'))}/>)}</div>:<Empty text={t('shop.emptyTitle')} action={<button type="button" className="btn" onClick={()=>{setQ('');selectCat('all')}}>{t('shop.emptyAction')}</button>}/>}
    </section>
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function ProductGallery({images,name}:{images?:string[];name:string}){
  const pics=(images||[]).filter(Boolean);
  const [index,setIndex]=useState(0);
  const touchX=useRef<number|null>(null);
  const {t}=useI18n();
  useEffect(()=>{setIndex(0)},[name,pics.join('|')]);
  if(!pics.length){
    return <div className="gallery"><div className="main-image"><ProductImage alt={name}/></div></div>;
  }
  const safeIndex=Math.min(index,pics.length-1);
  const go=(dir:number)=>setIndex(i=>(i+dir+pics.length)%pics.length);
  return (
    <div className="gallery">
      {pics.length>1&&(
        <div className="thumbs" role="tablist" aria-label={t('common.thumbnail')}>
          {pics.map((src,i)=>(
            <button type="button" key={`${src}-${i}`} className={i===safeIndex?'active':''} onClick={()=>setIndex(i)} aria-label={`${t('common.thumbnail')} ${i+1}`} aria-selected={i===safeIndex}>
              <ProductImage src={src} alt=""/>
            </button>
          ))}
        </div>
      )}
      <div
        className="main-image"
        onTouchStart={(e)=>{touchX.current=e.touches[0].clientX}}
        onTouchEnd={(e)=>{
          if(touchX.current==null)return;
          const dx=e.changedTouches[0].clientX-touchX.current;
          if(Math.abs(dx)>40)go(dx<0?1:-1);
          touchX.current=null;
        }}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={pics[safeIndex]}
            src={pics[safeIndex]}
            alt={`${name} — ${safeIndex+1}`}
            initial={{opacity:0}}
            animate={{opacity:1}}
            exit={{opacity:0}}
            transition={{duration:0.28}}
            onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}}
          />
        </AnimatePresence>
        {pics.length>1&&<>
          <button type="button" className="prev" onClick={()=>go(-1)} aria-label={t('common.previousImage')}><ChevronLeft/></button>
          <button type="button" className="next" onClick={()=>go(1)} aria-label={t('common.nextImage')}><ChevronRight/></button>
        </>}
      </div>
    </div>
  );
}
function ProductDetail(){
  const {slug}=useParams();
  const {add}=useCart();
  const [p,setP]=useState<Product|null>(null);
  const [related,setRelated]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const [color,setColor]=useState<string|undefined>();
  const [model,setModel]=useState<string|undefined>();
  const {t}=useI18n();
  
  useEffect(()=>{
    setLoading(true);setError('');setP(null);
    api(`/api/products?slug=${slug}`).then(d=>{
      setP(d.product);
      setRelated(d.related||[]);
      setColor(d.product?.colors?.[0]);
      setModel(d.product?.models?.[0]);
      if(d.product){
        api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: d.product.id, event_type: 'view'})}).catch(console.error);
      }
    }).catch(()=>setError(t('product.notFound'))).finally(()=>setLoading(false))
  },[slug]);

  if(loading)return <Layout><Loading/></Layout>;
  if(error||!p)return <Layout><Empty text={error||t('product.notFound')} action={<Link className="btn dark-btn" to="/shop">{t('product.backToShop')}</Link>}/></Layout>;
  const level=resolveStockPriority(p);
  
  return <Layout>
    <div className="product-detail">
      <ProductGallery images={p.images} name={p.name}/>
      <div className="info">
        <Link to="/shop" className="back-link"><ChevronLeft/> {t('product.backToShop')}</Link>
        <p className="eyebrow gold">{p.category?.name||BRAND.fullName}</p>
        <h1>{p.name}</h1>
        <p className="price">{money(p.price)}</p>
        <p className={`inventory-status tone-${level===1?'ok':level===2?'low':'out'}`}>
          {level===1?t('product.inStock'):level===2?t('product.limitedStock'):t('product.outOfStock')}
        </p>
        <p className="desc">{p.description}</p>
        {(p.colors?.length>0||p.models?.length>0)&&<div className="options">
          {p.colors?.length>0&&<div><span id="opt-color">{t('product.color')}</span><div role="group" aria-labelledby="opt-color">{p.colors.map(c=><button type="button" key={c} className={`opt ${color===c?'active':''}`} onClick={()=>setColor(c)} aria-pressed={color===c}>{c}</button>)}</div></div>}
          {p.models?.length>0&&<div><span id="opt-model">{t('product.model')}</span><div role="group" aria-labelledby="opt-model">{p.models.map(m=><button type="button" key={m} className={`opt ${model===m?'active':''}`} onClick={()=>setModel(m)} aria-pressed={model===m}>{m}</button>)}</div></div>}
        </div>}
        <button type="button" className="btn gold-btn" onClick={()=>{add(p,1,color,model);setToast(t('home.addedToBag'));api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);}} disabled={level===3}>{level===3?t('product.outOfStock'):t('product.addToCart')}</button>
        <div className="meta"><span><Truck/> {t('product.assurance')}</span><span><Package/> {t('product.packaging')}</span></div>
      </div>
    </div>
    {related.length>0&&<ProductSection title={t('product.relatedTitle')} subtitle={t('product.relatedSub')} products={related} onAdded={()=>setToast(t('home.addedToBag'))}/>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function Cart(){
  const {items,update,remove,total,clear}=useCart();
  const [ordering,setOrdering]=useState(false);
  const [toast,setToast]=useState<{text:string;tone:'ok'|'err'|'info'}|null>(null);
  const [error,setError]=useState('');
  const {t}=useI18n();
  const order=async()=>{
    if(ordering||!items.length)return;
    setOrdering(true);setError('');setToast({text:t('cart.ordering'),tone:'info'});
    try{
      const d=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map((x:any)=>({product_id:x.product.id,product_name:x.product.name,price:x.product.price,quantity:x.quantity,color:x.color,model:x.model})),total})});
      const lines=items.map((x:any)=>`• ${x.product.name}${x.color?` · ${x.color}`:''}${x.model?` · ${x.model}`:''} × ${x.quantity}`).join('\n');
      const text=t('cart.whatsappMessage', d.order_number, lines, money(total));
      setToast({text:t('cart.openingWhatsApp'),tone:'ok'});
      clear();
      window.setTimeout(()=>window.open(whatsappUrl(text),'_blank','noopener,noreferrer'),450);
    }catch(e:any){
      setError(e.message||t('cart.orderError'));
      setToast({text:e.message||t('cart.orderError'),tone:'err'});
    }finally{setOrdering(false)}
  };
  return <Layout><section className="cart-page"><div className="section-head"><div><p className="eyebrow gold">{t('cart.eyebrow')}</p><h1>{t('cart.title')}</h1></div><span>{items.length} {items.length===1?t('cart.pieces'):t('cart.piecesPlural')}</span></div>{items.length?<div className="cart-layout"><div>{items.map((x:any,i:number)=><article className="cart-item" key={`${x.product.id}-${x.color||''}-${x.model||''}-${i}`}><ProductImage src={x.product.images?.[0]} alt={x.product.name}/><div><h3>{x.product.name}</h3><p>{[x.color,x.model].filter(Boolean).join(' · ')}</p><strong>{money(x.product.price)}</strong><div className="quantity"><button type="button" onClick={()=>update(i,x.quantity-1)} aria-label={t('common.decreaseQty')}><Minus/></button><span aria-live="polite">{x.quantity}</span><button type="button" onClick={()=>update(i,x.quantity+1)} aria-label={t('common.increaseQty')}><Plus/></button></div></div><button type="button" className="remove" onClick={()=>remove(i)} aria-label={t('common.removeItem')}><Trash2/></button></article>)}</div><aside className="summary"><p className="eyebrow">{t('cart.summaryEyebrow')}</p><div><span>{t('cart.subtotal')}</span><b>{money(total)}</b></div><div><span>{t('cart.delivery')}</span><b>{t('cart.deliveryNote')}</b></div><hr/><div className="grand"><span>{t('cart.total')}</span><b>{money(total)}</b></div><button type="button" className="btn gold-btn" onClick={order} disabled={ordering} aria-busy={ordering}>{ordering?<Loader2 className="spin"/>:<MessageCircle/>} {ordering?t('cart.ordering'):t('cart.orderBtn')}</button>{error&&<p className="error" role="alert">{error}</p>}<p className="fine">{t('cart.finePrint')}</p><Link to="/shop"><ChevronLeft/> {t('cart.continue')}</Link></aside></div>:<Empty text={t('cart.emptyText')} action={<Link className="btn dark-btn" to="/shop">{t('cart.emptyBtn')}</Link>}/>}</section><AnimatePresence>{toast&&<Toast text={toast.text} tone={toast.tone} onClose={()=>setToast(null)}/>}</AnimatePresence></Layout>
}
function Empty({text,action}:{text:string;action?:React.ReactNode}){return <div className="empty" role="status"><Gem aria-hidden="true"/><h3>{text}</h3>{action}</div>}
function useAdminNoIndex(){useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow, noarchive';document.head.appendChild(meta);const oldTitle=document.title;document.title='Private Portal';return()=>{meta.remove();document.title=oldTitle}},[])}
function Protected({children}:{children:React.ReactNode}){const {user,loading}=useAuth();if(loading)return <Loading/>;return user?children:<Navigate to="/admin/login" replace/>}
function Login(){
  useAdminNoIndex();const {user}=useAuth();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const {t}=useI18n();
  if(user)return <Navigate to="/admin/dashboard" replace/>;
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');if(!supabase){setError(t('admin.invalidLogin'));setBusy(false);return;}const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(t('admin.invalidLogin'));setBusy(false)};
  return <main className="login"><BrandMark className="inverse"/><div className="login-card"><p className="eyebrow gold">{t('admin.loginPortal')}</p><h1>{t('admin.loginTitle')}</h1><p>{t('admin.loginSub')}</p><form onSubmit={submit}><label>{t('admin.email')}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label>{t('admin.password')}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={6} required/></label>{error&&<p className="error">{error}</p>}<button className="btn gold-btn" disabled={busy}>{busy?<Loader2 className="spin"/>:t('admin.signInBtn')}</button></form></div></main>
}
function AdminShell({children}:{children:React.ReactNode}){
  useAdminNoIndex();const [open,setOpen]=useState(false);const nav=useNavigate();const {t, lang, setLang}=useI18n();
  const {theme, toggle}=useThemeMode();
  const ThemeIcon = theme === 'light' ? Sun : Moon;
  const themeLabel = theme === 'light' ? t('header.themeDark') : t('header.themeLight');
  const logout=async()=>{await supabase?.auth.signOut();nav('/admin/login')};
  return <div className="admin"><aside className={open?'open':''}><BrandMark className="inverse"/><button type="button" className="close-admin" onClick={()=>setOpen(false)} aria-label={t('common.close')}><X/></button><nav><NavLink to="/admin/dashboard"><Gauge/> {t('admin.navDashboard')}</NavLink><NavLink to="/admin/products"><Gem/> {t('admin.navProducts')}</NavLink><NavLink to="/admin/hero"><ImageIcon/> {t('admin.navHero')}</NavLink><NavLink to="/admin/orders"><Package/> {t('admin.navOrders')}</NavLink></nav><button type="button" onClick={logout}><LogOut/> {t('admin.signOut')}</button></aside><div className="admin-main"><header><button type="button" onClick={()=>setOpen(true)} aria-label={t('header.menu')}><Menu/></button><div className="head-actions admin-head-actions"><button type="button" className="head-icon head-lang" onClick={()=>setLang(lang==='fr'?'en':'fr')} aria-label={t('header.lang')}>{lang.toUpperCase()}</button><button type="button" className="head-icon" onClick={toggle} aria-label={themeLabel} title={themeLabel}><ThemeIcon/></button><span>{t('admin.shopManager')}</span><CircleUser aria-hidden="true"/></div></header>{children}</div></div>
}
function AdminDashboard(){
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [warnings,setWarnings]=useState<string[]>([]);
  const {session}=useAuth();
  const {t}=useI18n();
  const load=()=>{
    if(!session?.access_token){
      setLoading(false);
      setError(t('admin.dashboardAuthError'));
      return;
    }
    setLoading(true);setError('');setWarnings([]);
    api('/api/dashboard',{headers:{Authorization:`Bearer ${session.access_token}`}})
      .then((d)=>{
        setData(d||null);
        if(Array.isArray(d?.warnings)&&d.warnings.length){
          setWarnings(d.warnings);
          if(import.meta.env.DEV)console.warn('[dashboard warnings]',d.warnings);
        }
        if(d?.error){
          // Keep owner-facing copy localized; log technical detail in DEV only
          if(import.meta.env.DEV)console.warn('[dashboard error]',d.error,d.warnings);
          setError(/partial|Some dashboard data/i.test(String(d.error))?t('admin.dashboardPartial'):t('admin.dashboardLoadError'));
        }
      })
      .catch((e:any)=>{
        if(import.meta.env.DEV)console.error('[dashboard]',e);
        setError(e.message||t('admin.dashboardLoadError'));
        setData(null);
      })
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[session?.access_token]);
  if(loading)return <AdminShell><Loading/></AdminShell>;
  const d=data||{
    totalProducts:0,available:0,lowStock:0,outOfStock:0,ordersToday:0,pending:0,delivered:0,revenue:0,
    recent:[],trendingProduct:null,bestSeller:null,mostViewed:null,mostCart:null,highestRevenue:null,runningLow:[],
  };
  const cards=[
    [t('admin.stats.totalProducts'),d.totalProducts,Gem],
    [t('admin.stats.available'),d.available,Check],
    [t('admin.stats.lowStock'),d.lowStock,TrendingUp],
    [t('admin.stats.outOfStock'),d.outOfStock,Package],
    [t('admin.stats.ordersToday'),d.ordersToday,MessageCircle],
    [t('admin.stats.pending'),d.pending,MessageCircle],
    [t('admin.stats.delivered'),d.delivered,Check],
    [t('admin.stats.revenue'),money(d.revenue||0),Sparkles],
  ];
  const widgets=[
    {label:t('admin.widgets.trending'),product:d.trendingProduct},
    {label:t('admin.widgets.bestSeller'),product:d.bestSeller},
    {label:t('admin.widgets.mostViewed'),product:d.mostViewed},
    {label:t('admin.widgets.mostCart'),product:d.mostCart},
    {label:t('admin.widgets.highestRevenue'),product:d.highestRevenue},
  ];
  const runningLow=d.runningLow||[];
  const insights=Array.isArray(d.insights)?d.insights:[];
  const insightLabel=(type:string)=>{
    if(type==='high_views_low_purchases')return t('admin.insights.highViewsLowPurchases');
    if(type==='high_carts_low_purchases')return t('admin.insights.highCartsLowPurchases');
    if(type==='low_views_high_purchases')return t('admin.insights.lowViewsHighPurchases');
    if(type==='high_purchases_low_stock')return t('admin.insights.highPurchasesLowStock');
    return type;
  };
  return <AdminShell><section className="admin-content">
    <div className="admin-title"><div><p className="eyebrow gold">{t('admin.dashboardEyebrow')}</p><h1>{t('admin.dashboardTitle')}</h1></div><Link to="/admin/products" className="btn gold-btn"><Plus/> {t('admin.addProduct')}</Link></div>
    {error&&<p className="error" role="alert" style={{marginBottom:'1.25rem'}}>{error} <button type="button" className="btn dark-btn" style={{marginLeft:12}} onClick={load}>{t('common.retry')}</button></p>}
    {!error&&warnings.length>0&&<p className="fine" role="status" style={{marginBottom:'1.25rem',color:'var(--fg-muted)'}}>{t('admin.dashboardPartial')} <button type="button" className="btn dark-btn" style={{marginLeft:12}} onClick={load}>{t('common.retry')}</button></p>}
    <div className="stat-grid simple-stats">{cards.map(([n,v,I]:any)=><article key={n}><I/><span>{n}</span><strong>{v}</strong></article>)}</div>
    <div className="admin-title" style={{marginTop:'2rem'}}><div><p className="eyebrow gold">{t('admin.analyticsEyebrow')}</p><h2>{t('admin.analyticsTitle')}</h2></div></div>
    <div className="stat-grid simple-stats">{widgets.map(w=><article key={w.label}><span>{w.label}</span><strong style={{fontSize:'0.85rem',textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap'}}>{w.product?.name||'—'}</strong></article>)}</div>
    {insights.length>0&&<>
      <div className="admin-title" style={{marginTop:'2rem'}}><div><p className="eyebrow gold">{t('admin.insightsEyebrow')}</p><h2>{t('admin.insightsTitle')}</h2></div></div>
      <div className="insight-list">
        {insights.map((ins:any,i:number)=>(
          <article key={`${ins.type}-${ins.productId}-${i}`} className="insight-card">
            <b>{insightLabel(ins.type)}</b>
            <span>{ins.productName}</span>
          </article>
        ))}
      </div>
    </>}
    <div className="admin-panels">
      <article>
        <div className="panel-head"><p className="eyebrow">{t('admin.runningLow')}</p><Link to="/admin/products">{t('admin.navProducts')}</Link></div>
        {runningLow.length?runningLow.map((p:any)=>(
          <Link className="mini-order" to="/admin/products" key={p.id}>
            <div><b>{p.name}</b><span>{t('admin.qty')} {p.stock_quantity} · {t('admin.stockState.low')} ≤ {p.low_stock_threshold??5}</span></div>
            <Stock n={p.stock_quantity} threshold={p.low_stock_threshold} priority={p.stockPriority}/>
          </Link>
        )):<p className="fine" style={{padding:'12px 0'}}>{t('admin.runningLowEmpty')}</p>}
      </article>
      <article>
        <div className="panel-head"><p className="eyebrow">{t('admin.latestOrders')}</p><Link to="/admin/orders">{t('admin.viewAllOrders')}</Link></div>
        {(d.recent||[]).length?(d.recent||[]).map((o:any)=><Link className="mini-order" to="/admin/orders" key={o.id}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleDateString()}</span></div><strong>{money(o.total)}</strong><Status status={t(`admin.orderStatuses.${o.status}`)||o.status}/></Link>):<p className="fine" style={{padding:'12px 0'}}>{t('admin.noOrders')}</p>}
      </article>
    </div>
  </section></AdminShell>
}
const authHeaders=(token?:string)=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});
function AdminProducts(){
  const [products,setProducts]=useState<Product[]>([]);
  const [cats,setCats]=useState<any[]>([]);
  const [q,setQ]=useState('');
  const [editing,setEditing]=useState<any>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
  const {session}=useAuth();
  const {t}=useI18n();
  const load=()=>{
    if(!session?.access_token){setLoading(false);setError(t('admin.dashboardAuthError'));return;}
    setLoading(true);
    Promise.all([api('/api/products?admin=true',{headers:authHeaders(session.access_token)}),api('/api/categories')])
      .then(([p,c])=>{setProducts(p);setCats(c);setError('')})
      .catch(()=>setError(t('admin.productsLoadError')))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[session?.access_token]);
  const del=async(id:string|number)=>{
    if(!confirm(t('admin.confirmDelete')))return;
    try{
      await api('/api/products',{method:'DELETE',headers:authHeaders(session?.access_token),body:JSON.stringify({id})});
      setToast(t('admin.productDeleted'));
      load();
    }catch(e:any){setError(e.message||t('admin.productSaveError'))}
  };
  return <AdminShell><section className="admin-content">
    <div className="admin-title"><div><p className="eyebrow gold">{t('admin.productsEyebrow')}</p><h1>{t('admin.productsTitle')}</h1></div><button type="button" className="btn gold-btn" onClick={()=>setEditing({})}><Plus/> {t('admin.addProduct')}</button></div>
    <label className="admin-search"><Search aria-hidden="true"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('admin.searchProduct')} aria-label={t('admin.searchProduct')}/></label>
    {loading?<Loading/>:error&&!products.length?<Empty text={error} action={<button type="button" className="btn dark-btn" onClick={load}>{t('common.retry')}</button>}/>:(
      <div className="table-wrap"><table><thead><tr><th>{t('admin.table.product')}</th><th>{t('admin.table.category')}</th><th>{t('admin.table.price')}</th><th>{t('admin.table.stock')}</th><th><span className="sr-only">{t('common.edit')}</span></th></tr></thead><tbody>{products.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).map(p=><tr key={p.id}><td><div className="table-product"><ProductImage src={p.images?.[0]} alt=""/><div><b>{p.name}</b><span>{p.short_description}</span></div></div></td><td>{p.category?.name}</td><td>{money(p.price)}</td><td><Stock n={p.stock_quantity} threshold={p.low_stock_threshold} priority={p.stockPriority}/></td><td><button type="button" onClick={()=>setEditing(p)} aria-label={t('common.edit')}><Pencil/></button><button type="button" onClick={()=>del(p.id)} aria-label={t('common.delete')}><Trash2/></button></td></tr>)}</tbody></table></div>
    )}
    {editing&&<ProductModal item={editing} cats={cats} token={session?.access_token} close={()=>{setEditing(null);setError('')}} done={()=>{setEditing(null);setToast(t('admin.productSaved'));load()}} error={error} setError={setError}/>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </section></AdminShell>;
}
function Stock({n,threshold=5,priority}:{n:number;threshold?:number;priority?:number}){
  const {t}=useI18n();
  const level=resolveStockPriority({stock_quantity:n,low_stock_threshold:threshold,stockPriority:priority});
  return <span className={`stock ${level===3?'out':level===2?'low':''}`}><i/>{level===3?t('admin.stockState.out'):level===2?`${n} · ${t('admin.stockState.low')}`:`${n} ${t('admin.stockState.available')}`}</span>
}
function ProductModal({item,cats,token,close,done,error,setError}:any){
  const {t}=useI18n();
  const toCsv=(v:unknown)=>{
    if(Array.isArray(v))return v.map(x=>String(x).trim()).filter(Boolean).join(', ');
    if(typeof v==='string')return v;
    return '';
  };
  const [form,setForm]=useState({
    name:item.name||'',
    short_description:item.short_description||'',
    description:item.description||'',
    price:item.price??'',
    category_id:item.category_id||cats[0]?.id||'',
    stock_quantity:item.stock_quantity??1,
    low_stock_threshold:item.low_stock_threshold??5,
    colors:toCsv(item.colors),
    models:toCsv(item.models),
    images:Array.isArray(item.images)?[...item.images]:[],
    featured:!!item.featured,
    hidden:!!item.hidden,
    active:item.active??true,
    display_priority:item.display_priority??'',
  });
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [uploadNote,setUploadNote]=useState('');
  const [showAdvanced,setShowAdvanced]=useState(false);
  const busy=saving||uploading;
  const set=(k:string,v:any)=>setForm(x=>({...x,[k]:v}));
  const parseList=(raw:string)=>String(raw||'').split(',').map((x:string)=>x.trim()).filter(Boolean);

  const friendlySaveError=(err:any)=>{
    const code=err?.code||'';
    const m=String(err?.message||err||'');
    if(code==='SCHEMA_OPTIONS'||/options could not be saved|colors|models|schema cache|missing products\./i.test(m))return t('admin.productOptionsSaveError');
    if(code==='SCHEMA_VISIBILITY'||/visibility settings|featured|hidden/i.test(m))return t('admin.productVisibilitySaveError');
    if(code==='SCHEMA_PRODUCT'||/product details could not/i.test(m))return t('admin.productSaveError');
    if(/timed out/i.test(m))return t('admin.productSaveTimeout');
    if(/unauthorized/i.test(m))return t('admin.dashboardAuthError');
    if(/migration|Database is missing/i.test(m))return t('admin.productOptionsSaveError');
    if(/could not be saved|something went wrong|invalid server|failed/i.test(m))return t('admin.productSaveError');
    // Never surface raw PostgREST/schema text to the owner
    if(/postgrest|postgres|column|schema cache|PGRST/i.test(m))return t('admin.productSaveError');
    return t('admin.productSaveError');
  };

  const validate=()=>{
    if(!form.name.trim())return t('admin.validationName');
    if(!form.category_id)return t('admin.validationCategory');
    if(form.price===''||Number(form.price)<0||Number.isNaN(Number(form.price)))return t('admin.validationPrice');
    if(form.stock_quantity===''||Number(form.stock_quantity)<0||Number.isNaN(Number(form.stock_quantity)))return t('admin.validationStock');
    if(form.low_stock_threshold!==''&&(Number(form.low_stock_threshold)<0||Number.isNaN(Number(form.low_stock_threshold))))return t('admin.validationLowStock');
    if(form.display_priority!==''&&(Number(form.display_priority)<1||Number.isNaN(Number(form.display_priority))))return t('admin.validationPriority');
    if(!form.images.length)return t('admin.modal.errorImage');
    return '';
  };

  const moveImage=(from:number,to:number)=>{
    if(to<0||to>=form.images.length)return;
    setForm(x=>{
      const next=[...x.images];
      const [img]=next.splice(from,1);
      next.splice(to,0,img);
      return {...x,images:next};
    });
  };

  const upload=async(files:FileList|null)=>{
    if(!files?.length||busy)return;
    setUploading(true);setError('');setUploadNote(t('admin.uploadProgress'));
    try{
      const urls:string[]=[];
      for(const file of Array.from(files)){
        if(!file.type.startsWith('image/'))continue;
        const base64=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve((r.result as string).split(',')[1]);r.onerror=()=>reject(new Error(t('admin.uploadError')));r.readAsDataURL(file)});
        const d=await api('/api/upload',{method:'POST',headers:authHeaders(token),body:JSON.stringify({fileName:`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,fileBase64:base64,contentType:file.type})});
        if(d?.url)urls.push(d.url);
      }
      if(!urls.length)throw new Error(t('admin.uploadError'));
      setForm(x=>({...x,images:[...x.images,...urls]}));
      setUploadNote(t('admin.uploadSuccess'));
    }catch(e:any){
      console.error('[product upload]',e);
      setUploadNote('');
      setError(t('admin.uploadError'));
    }finally{setUploading(false)}
  };

  const save=async(e:FormEvent)=>{
    e.preventDefault();
    if(busy)return;
    const v=validate();
    if(v){setError(v);return}
    setSaving(true);setError('');
    try{
      const short=form.short_description.trim()||form.name.trim();
      await api('/api/products',{method:item.id?'PUT':'POST',headers:authHeaders(token),body:JSON.stringify({
        id:item.id,
        name:form.name.trim(),
        short_description:short,
        description:form.description.trim(),
        price:Number(form.price),
        category_id:form.category_id,
        stock_quantity:Number(form.stock_quantity),
        low_stock_threshold:form.low_stock_threshold===''?5:Number(form.low_stock_threshold),
        display_priority:form.display_priority===''?null:Number(form.display_priority),
        colors:parseList(form.colors),
        models:parseList(form.models),
        images:form.images,
        featured:!!form.featured,
        hidden:!!form.hidden,
        active:!!form.active,
      })});
      done();
    }catch(e:any){
      console.error('[product save]',e);
      setError(friendlySaveError(e));
    }finally{setSaving(false)}
  };

  return <div className="modal-bg" role="presentation" onClick={(e)=>{if(e.target===e.currentTarget&&!busy)close()}}>
    <form className="modal product-modal" onSubmit={save} aria-busy={busy} noValidate>
      <div className="modal-head">
        <div>
          <p className="eyebrow gold">{item.id?t('admin.modal.editProduct'):t('admin.modal.newProduct')}</p>
          <h2>{item.id?t('admin.modal.productDetails'):t('admin.modal.addTitle')}</h2>
        </div>
        <button type="button" onClick={close} aria-label={t('common.close')} disabled={busy}><X/></button>
      </div>

      <div className="form-sections">
        <section className="form-section">
          <h3>{t('admin.modal.sectionInfo')}</h3>
          <div className="form-grid">
            <label className="full">{t('admin.modal.name')}<input value={form.name} onChange={e=>set('name',e.target.value)} required maxLength={120} autoFocus/></label>
            <label className="full">{t('admin.modal.shortDesc')}<input value={form.short_description} onChange={e=>set('short_description',e.target.value)} maxLength={180} placeholder={t('admin.modal.shortDescHint')}/></label>
            <label className="full">{t('admin.modal.desc')}<textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={3} placeholder={t('admin.modal.descHint')}/></label>
            <label>{t('admin.modal.category')}<select value={form.category_id} onChange={e=>set('category_id',e.target.value)} required>{cats.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>{t('admin.modal.price')}<input type="number" min="0" step="0.01" value={form.price} onChange={e=>set('price',e.target.value)} required/></label>
            <label>{t('admin.modal.stockQty')}<input type="number" min="0" value={form.stock_quantity} onChange={e=>set('stock_quantity',e.target.value)} required/></label>
          </div>
        </section>

        <section className="form-section">
          <h3>{t('admin.modal.sectionPhotos')}</h3>
          <p className="fine">{t('admin.modal.photosHint')}</p>
          <label className={`full upload ${uploading?'is-busy':''}`}>
            {t('admin.modal.photos')}
            <input type="file" accept="image/*" multiple disabled={busy} onChange={e=>{upload(e.target.files);e.target.value=''}}/>
            <span><Plus/> {uploading?t('admin.uploadProgress'):t('admin.modal.choosePhotos')}</span>
          </label>
          {uploadNote&&<p className="fine upload-status" role="status">{uploadNote}</p>}
          <div className="image-preview full">
            {form.images.map((im:string,i:number)=>(
              <div key={`${im}-${i}`} className="image-preview-item">
                <ProductImage src={im} alt=""/>
                {i===0?<em className="cover-tag">{t('admin.modal.coverBadge')}</em>:<em className="cover-tag muted">{i+1}</em>}
                <div className="image-preview-actions">
                  <button type="button" onClick={()=>moveImage(i,i-1)} disabled={busy||i===0} aria-label={t('admin.modal.moveImageLeft')}><ChevronLeft/></button>
                  <button type="button" onClick={()=>moveImage(i,i+1)} disabled={busy||i===form.images.length-1} aria-label={t('admin.modal.moveImageRight')}><ChevronRight/></button>
                  <button type="button" onClick={()=>set('images',form.images.filter((_:string,n:number)=>n!==i))} aria-label={t('admin.removeImage')} disabled={busy}><X/></button>
                </div>
              </div>
            ))}
          </div>
          {!form.images.length&&<p className="fine">{t('admin.modal.photosEmpty')}</p>}
        </section>

        <section className="form-section">
          <h3>{t('admin.modal.sectionOptions')}</h3>
          <div className="form-grid">
            <label className="full">{t('admin.modal.colors')}<input value={form.colors} onChange={e=>set('colors',e.target.value)} placeholder={t('admin.colorsPlaceholder')}/></label>
            <label className="full">{t('admin.modal.models')}<input value={form.models} onChange={e=>set('models',e.target.value)} placeholder={t('admin.modelsPlaceholder')}/></label>
          </div>
          <p className="fine">{t('admin.modal.optionsHint')}</p>
        </section>

        <section className="form-section">
          <h3>{t('admin.modal.sectionVisibility')}</h3>
          <div className="checks visibility-checks">
            <label className="check-card featured-check">
              <input type="checkbox" checked={form.featured} onChange={e=>set('featured',e.target.checked)}/>
              <span>
                <b>{t('admin.modal.featuredTitle')}</b>
                <small>{t('admin.modal.featuredHelp')}</small>
              </span>
            </label>
            <label className="check-card">
              <input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/>
              <span>
                <b>{t('admin.modal.activeTitle')}</b>
                <small>{t('admin.modal.activeHelp')}</small>
              </span>
            </label>
            <label className="check-card">
              <input type="checkbox" checked={form.hidden} onChange={e=>set('hidden',e.target.checked)}/>
              <span>
                <b>{t('admin.modal.hiddenTitle')}</b>
                <small>{t('admin.modal.hiddenHelp')}</small>
              </span>
            </label>
          </div>
        </section>

        <section className="form-section advanced-section">
          <button type="button" className="advanced-toggle" onClick={()=>setShowAdvanced(v=>!v)} aria-expanded={showAdvanced}>
            {showAdvanced?t('admin.modal.hideAdvanced'):t('admin.modal.showAdvanced')}
          </button>
          {showAdvanced&&(
            <div className="form-grid" style={{marginTop:12}}>
              <label>{t('admin.modal.lowStockThresh')}<input type="number" min="0" value={form.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/><small className="field-hint">{t('admin.modal.lowStockHelp')}</small></label>
              <label>{t('admin.modal.priority')}<input type="number" min="1" value={form.display_priority} onChange={e=>set('display_priority',e.target.value)} placeholder={t('admin.priorityPlaceholder')}/><small className="field-hint">{t('admin.modal.priorityHelp')}</small></label>
            </div>
          )}
        </section>
      </div>

      {error&&<p className="error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={close} disabled={busy}>{t('admin.modal.cancel')}</button>
        <button className="btn gold-btn" disabled={busy} aria-busy={busy}>{busy?<Loader2 className="spin"/>:<Check/>} {saving?t('admin.modal.saving'):t('admin.modal.save')}</button>
      </div>
    </form>
  </div>
}
const statuses=['Pending','Discussing on WhatsApp','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'];
function Status({status}:{status:string}){return <span className={`status s-${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span>}
function AdminHero(){
  const [slides,setSlides]=useState<any[]>([]);
  const [editing,setEditing]=useState<any|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [toast,setToast]=useState('');
  const {session}=useAuth();
  const {t}=useI18n();
  const load=()=>{
    if(!session?.access_token){setLoading(false);setError(t('admin.dashboardAuthError'));return;}
    setLoading(true);
    api('/api/hero?admin=true',{headers:authHeaders(session.access_token)})
      .then((data)=>{setSlides(Array.isArray(data)?data:[]);setError('')})
      .catch((e:any)=>setError(e.message||t('admin.heroEmpty')))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load()},[session?.access_token]);

  const upload=async(files:FileList|null)=>{
    if(!files?.length||!editing)return;
    setBusy(true);setError('');
    try{
      const file=files[0];
      const base64=await new Promise<string>((resolve,reject)=>{
        const r=new FileReader();
        r.onload=()=>resolve((r.result as string).split(',')[1]);
        r.onerror=()=>reject(new Error(t('admin.uploadError')));
        r.readAsDataURL(file);
      });
      const d=await api('/api/upload',{method:'POST',headers:authHeaders(session?.access_token),body:JSON.stringify({fileName:`hero-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,fileBase64:base64,contentType:file.type||'image/jpeg'})});
      if(!d?.url)throw new Error(t('admin.uploadError'));
      setEditing((x:any)=>({...x,image_url:d.url}));
    }catch(e:any){setError(e.message||t('admin.uploadError'))}finally{setBusy(false)}
  };

  const save=async(e:FormEvent)=>{
    e.preventDefault();
    if(!editing?.image_url)return setError(t('admin.heroImageRequired'));
    setBusy(true);setError('');
    try{
      const isNew=!editing.id;
      const payload={
        title:editing.title||null,
        subtitle:editing.subtitle||null,
        cta_label:editing.cta_label||null,
        cta_href:editing.cta_href||'/shop',
        display_order:Number(editing.display_order)||1,
        enabled:editing.enabled!==false,
        image_url:editing.image_url,
        ...(isNew?{}:{id:editing.id}),
      };
      await api('/api/hero',{
        method:isNew?'POST':'PUT',
        headers:authHeaders(session?.access_token),
        body:JSON.stringify(payload),
      });
      setEditing(null);
      setToast(isNew?t('admin.heroAdd'):t('admin.save'));
      load();
    }catch(err:any){setError(err.message||t('admin.productSaveError'))}finally{setBusy(false)}
  };

  const remove=async(id:string)=>{
    if(!confirm(t('admin.heroConfirmDelete')))return;
    setError('');
    try{
      await api('/api/hero',{method:'DELETE',headers:authHeaders(session?.access_token),body:JSON.stringify({id})});
      load();
    }catch(e:any){setError(e.message)}
  };

  const move=async(index:number,delta:number)=>{
    const target=index+delta;
    if(target<0||target>=slides.length)return;
    const next=[...slides];
    [next[index],next[target]]=[next[target],next[index]];
    setSlides(next.map((s,i)=>({...s,display_order:i+1})));
    try{
      const updated=await api('/api/hero',{method:'PUT',headers:authHeaders(session?.access_token),body:JSON.stringify({orderedIds:next.map(s=>s.id)})});
      if(Array.isArray(updated))setSlides(updated);
      else load();
    }catch(e:any){setError(e.message);load()}
  };

  const toggle=async(slide:any)=>{
    setError('');
    try{
      await api('/api/hero',{method:'PUT',headers:authHeaders(session?.access_token),body:JSON.stringify({id:slide.id,enabled:!slide.enabled})});
      load();
    }catch(e:any){setError(e.message)}
  };

  return <AdminShell><section className="admin-content">
    <div className="admin-title">
      <div><p className="eyebrow gold">{t('admin.heroEyebrow')}</p><h1>{t('admin.heroTitle')}</h1></div>
      <button type="button" className="btn gold-btn" onClick={()=>setEditing({title:'',subtitle:'',cta_label:t('home.exploreBtn'),cta_href:'/shop',display_order:(slides.length+1),enabled:true,image_url:''})}><Plus/> {t('admin.heroAdd')}</button>
    </div>
    <p className="fine" style={{marginTop:'-1rem',marginBottom:'1.5rem'}}>{t('admin.heroHelp')}</p>
    {error&&!editing&&<p className="error" role="alert">{error}</p>}
    {loading?<Loading/>:(
    <div className="hero-admin-list">
      {slides.map((s,i)=>(
        <article key={s.id} className={`hero-admin-card ${s.enabled?'':'disabled'}`}>
          <ProductImage src={s.image_url} alt={s.title||t('admin.heroAlt')}/>
          <div>
            <b>{s.title||t('admin.heroUntitled')}</b>
            <span>{t('admin.heroOrder')}: {s.display_order} · {s.enabled?t('admin.heroEnabled'):t('admin.heroDisabled')}</span>
            <small>{s.subtitle}</small>
          </div>
          <div className="hero-admin-actions">
            <button type="button" onClick={()=>move(i,-1)} aria-label={t('admin.heroMoveUp')} disabled={i===0}><ChevronLeft/></button>
            <button type="button" onClick={()=>move(i,1)} aria-label={t('admin.heroMoveDown')} disabled={i===slides.length-1}><ChevronRight/></button>
            <button type="button" onClick={()=>toggle(s)}>{s.enabled?t('admin.heroDisable'):t('admin.heroEnable')}</button>
            <button type="button" onClick={()=>{setError('');setEditing(s)}} aria-label={t('common.edit')}><Pencil/></button>
            <button type="button" onClick={()=>remove(s.id)} aria-label={t('common.delete')}><Trash2/></button>
          </div>
        </article>
      ))}
      {!slides.length&&<Empty text={t('admin.heroEmpty')}/>}
    </div>
    )}
    {editing&&<div className="modal-bg"><form className="modal" onSubmit={save}>
      <div className="modal-head"><div><p className="eyebrow gold">{editing.id?t('admin.heroEdit'):t('admin.heroNew')}</p><h2>{t('admin.heroTitle')}</h2></div><button type="button" onClick={()=>setEditing(null)} aria-label={t('common.close')}><X/></button></div>
      <div className="form-grid">
        <label className="full">{t('admin.heroTitleField')}<input value={editing.title||''} onChange={e=>setEditing({...editing,title:e.target.value})}/></label>
        <label className="full">{t('admin.heroSubtitle')}<textarea value={editing.subtitle||''} onChange={e=>setEditing({...editing,subtitle:e.target.value})}/></label>
        <label>{t('admin.heroCtaLabel')}<input value={editing.cta_label||''} onChange={e=>setEditing({...editing,cta_label:e.target.value})}/></label>
        <label>{t('admin.heroCtaHref')}<input value={editing.cta_href||'/shop'} onChange={e=>setEditing({...editing,cta_href:e.target.value})}/></label>
        <label>{t('admin.heroOrder')}<input type="number" min="1" value={editing.display_order??1} onChange={e=>setEditing({...editing,display_order:e.target.value})}/></label>
        <label className="checks"><input type="checkbox" checked={editing.enabled!==false} onChange={e=>setEditing({...editing,enabled:e.target.checked})}/> {t('admin.heroEnabled')}</label>
        <label className="full upload">{t('admin.heroImage')}<input type="file" accept="image/*" onChange={e=>upload(e.target.files)}/><span><Plus/> {busy?t('admin.modal.uploading'):t('admin.heroChooseImage')}</span></label>
        {editing.image_url?<div className="image-preview full"><div><img src={editing.image_url} alt=""/></div></div>:null}
      </div>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" onClick={()=>setEditing(null)} disabled={busy}>{t('admin.heroCancel')}</button><button className="btn gold-btn" disabled={busy} aria-busy={busy}>{busy?<Loader2 className="spin"/>:<Check/>} {t('admin.save')}</button></div>
    </form></div>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </section></AdminShell>;
}
function AdminOrders(){
  const [orders,setOrders]=useState<any[]>([]);const [selected,setSelected]=useState<any>(null);const [q,setQ]=useState('');const [filter,setFilter]=useState('All');const {session}=useAuth();const {t}=useI18n();
  const load=()=>api('/api/orders',{headers:authHeaders(session?.access_token)}).then(setOrders);useEffect(()=>{load()},[]);
  const shown=orders.filter(o=>(filter==='All'||o.status===filter)&&(o.order_number.toLowerCase().includes(q.toLowerCase())||(o.customer_name||'').toLowerCase().includes(q.toLowerCase())));
  return <AdminShell><section className="admin-content"><div className="admin-title"><div><p className="eyebrow gold">{t('admin.clientOrdersEyebrow')}</p><h1>{t('admin.ordersTitle')}</h1></div></div><div className="order-tools"><label className="admin-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('admin.searchOrder')}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">{t('admin.filterAll')}</option>{statuses.map(s=><option key={s} value={s}>{t(`admin.orderStatuses.${s}`)||s}</option>)}</select></div><div className="order-list">{shown.map(o=><button key={o.id} onClick={()=>setSelected(o)}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleString()}</span></div><div><b>{o.customer_name||t('admin.whatsappClient')}</b><span>{o.items?.length} {t('cart.piecesPlural')}</span></div><strong>{money(o.total)}</strong><Status status={t(`admin.orderStatuses.${o.status}`)||o.status}/><ChevronRight/></button>)}</div>{!shown.length&&<Empty text={t('admin.noOrders')}/>}{selected&&<OrderDrawer order={selected} token={session?.access_token} close={()=>setSelected(null)} done={()=>{setSelected(null);load()}}/>}</section></AdminShell>
}
function OrderDrawer({order,token,close,done}:any){
  const [form,setForm]=useState({...order});const [busy,setBusy]=useState(false);const {t}=useI18n();
  const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));
  const save=async(status?:string)=>{setBusy(true);await api('/api/orders',{method:'PUT',headers:authHeaders(token),body:JSON.stringify({...form,status:status||form.status})});setBusy(false);done()};
  const customerWa=(form.whatsapp_number||SOCIAL.whatsappNumber).replace(/\D/g,'');
  const waHref=`https://wa.me/${customerWa}?text=${encodeURIComponent(t('admin.waMessagePrefix')+' '+form.order_number)}`;
  return <div className="drawer-bg" onClick={close}><aside className="drawer" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="order-drawer-title"><div className="modal-head"><div><p className="eyebrow gold">{form.order_number}</p><h2 id="order-drawer-title">{t('admin.orderDetails')}</h2></div><button type="button" onClick={close} aria-label={t('common.close')}><X/></button></div><Status status={t(`admin.orderStatuses.${form.status}`)||form.status}/><div className="drawer-items">{form.items.map((x:any,i:number)=><div key={i}><ProductImage src={x.product?.images?.[0]} alt=""/><span><b>{x.product_name}</b><small>{[x.color,x.model].filter(Boolean).join(' · ')} · {t('admin.qty')} {x.quantity}</small></span><strong>{money(x.price*x.quantity)}</strong></div>)}</div><div className="drawer-total"><span>{t('cart.total')}</span><b>{money(form.total)}</b></div><h3>{t('admin.customerInfo')}</h3><div className="form-grid"><label>{t('admin.name')}<input value={form.customer_name||''} onChange={e=>set('customer_name',e.target.value)}/></label><label>{t('admin.waNumber')}<input value={form.whatsapp_number||''} onChange={e=>set('whatsapp_number',e.target.value)}/></label><label className="full">{t('admin.address')}<textarea value={form.address||''} onChange={e=>set('address',e.target.value)}/></label><label className="full">{t('admin.gps')}<input value={form.gps_location||''} onChange={e=>set('gps_location',e.target.value)}/></label><label>{t('admin.paymentMethod')}<input value={form.payment_method||''} onChange={e=>set('payment_method',e.target.value)}/></label><label>{t('admin.deliveryInstructions')}<input value={form.delivery_instructions||''} onChange={e=>set('delivery_instructions',e.target.value)}/></label><label className="full">{t('admin.status')}<select value={form.status} onChange={e=>set('status',e.target.value)}>{statuses.map(s=><option key={s} value={s}>{t(`admin.orderStatuses.${s}`)||s}</option>)}</select></label></div><div className="quick"><a href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle/> {t('admin.drawer.openWhatsApp')}</a><button type="button" onClick={()=>navigator.clipboard.writeText(form.address||'')}><Copy/> {t('admin.address')}</button><button type="button" onClick={()=>navigator.clipboard.writeText(form.gps_location||'')}><MapPin/> {t('admin.gps')}</button></div><div className="modal-actions"><button type="button" className="danger" onClick={()=>save('Cancelled')} disabled={busy}>{t('admin.cancelOrder')}</button><button type="button" className="btn dark-btn" onClick={()=>save('Delivered')} disabled={busy}>{t('admin.markDelivered')}</button><button type="button" className="btn gold-btn" onClick={()=>save()} disabled={busy}>{busy?<Loader2 className="spin"/>:<Check/>} {t('admin.save')}</button></div></aside></div>
}
export default function App(){
  return <ThemeProvider><I18nProvider><Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:slug" element={<ProductDetail/>}/><Route path="/cart" element={<Cart/>}/><Route path="/admin/login" element={<Login/>}/><Route path="/admin" element={<Protected><Navigate to="/admin/dashboard" replace/></Protected>}/><Route path="/admin/dashboard" element={<Protected><AdminDashboard/></Protected>}/><Route path="/admin/products" element={<Protected><AdminProducts/></Protected>}/><Route path="/admin/hero" element={<Protected><AdminHero/></Protected>}/><Route path="/admin/orders" element={<Protected><AdminOrders/></Protected>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></I18nProvider></ThemeProvider>
}
