import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleUser, Copy, Gauge, Gem, Instagram, Loader2, LogOut, MapPin, Menu, MessageCircle, Minus, Moon, Package, Pencil, Plus, Search, ShoppingBag, Sparkles, Star, Sun, Trash2, TrendingUp, Truck, X } from 'lucide-react';

// ── Theme ──────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<'light'|'dark'>(() => {
    const saved = localStorage.getItem('ks-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ks-theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  return { theme, toggle };
}
// Global theme context
let _themeToggle: (() => void) | null = null;
let _theme: 'light'|'dark' = 'dark';
function ThemeProvider({children}:{children:React.ReactNode}){
  const {theme,toggle}=useTheme();
  _themeToggle=toggle; _theme=theme;
  return <>{children}</>;
}
import { I18nProvider, useI18n } from './i18n/Context';
import { useCart, type Product } from './contexts/CartContext';
import { useAuth } from './contexts/AuthContext';
import supabase from './lib/supabase';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
async function api(path:string, options?:RequestInit){const r=await fetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
function Toast({text,onClose}:{text:string;onClose:()=>void}){useEffect(()=>{const t=setTimeout(onClose,2600);return()=>clearTimeout(t)},[onClose]);return <motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} exit={{y:20,opacity:0}} className="toast"><Check size={16}/>{text}</motion.div>}
function Header(){
  const {count}=useCart();
  const [open,setOpen]=useState(false);
  const {t, lang, setLang}=useI18n();
  return <header className="header">
    <Link to="/" className="brand">Ken's <span>Shop</span></Link>
    <nav className={open?'nav open':'nav'}>
      <Link to="/" onClick={()=>setOpen(false)}>{t('nav.home')}</Link>
      <Link to="/shop" onClick={()=>setOpen(false)}>{t('nav.catalog')}</Link>
    </nav>
    <div className="head-actions">
      <button className="theme-toggle" onClick={()=>setLang(lang==='fr'?'en':'fr')} aria-label="Lang" style={{fontSize: '11px', fontWeight:'bold', letterSpacing:'1px'}}>{lang.toUpperCase()}</button>
      <button className="theme-toggle" onClick={()=>_themeToggle?.()} aria-label="Theme" title={_theme==='dark'?t('header.themeLight'):t('header.themeDark')}>{_theme==='dark'?<Sun/>:<Moon/>}</button>
      <Link to="/cart" className="bag" aria-label={t('header.cart')}><ShoppingBag/><b>{count}</b></Link>
      <button className="menu" onClick={()=>setOpen(!open)} aria-label={t('header.menu')}>{open?<X/>:<Menu/>}</button>
    </div>
  </header>
}
function Footer(){const {t}=useI18n();return <footer><div><Link to="/" className="brand inverse">Ken's <span>Shop</span></Link><p>{t('footer.description')}</p></div><div><b>{t('footer.shopTitle')}</b><Link to="/shop">{t('footer.viewCatalog')}</Link><a href="https://wa.me/15551234567">WhatsApp</a></div><div><b>{t('footer.contactTitle')}</b><a href="https://instagram.com" target="_blank">Instagram</a><a href="mailto:contact@kensshop.com">E-mail</a></div><small>{t('footer.copyright')}</small></footer>}
function Layout({children}:{children:React.ReactNode}){return <><Header/><main>{children}</main><Footer/><a className="float-wa" href="https://wa.me/15551234567" target="_blank" aria-label="WhatsApp"><MessageCircle/></a></>}
function ProductCard({p,onAdded}:{p:Product;onAdded?:()=>void}){
  const {add}=useCart();
  const {t}=useI18n();
  const trackCart = () => {
    api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);
  };
  return <article className="product-card">
    <Link to={`/product/${p.slug}`} className="product-image">
      <img src={p.images?.[0]} alt={p.name} loading="lazy"/>
      <span className="inventory-badge" style={{
        background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '11px', padding: '4px 8px', borderRadius: '4px'
      }}>
        {p.stockPriority===1?`🟢 ${t('product.inStock')}`:p.stockPriority===2?`🟡 ${t('product.limitedStock')}`:`🔴 ${t('product.outOfStock')}`}
      </span>
    </Link>
    <div>
      <p className="eyebrow">{p.category?.name||'KENS selection'}</p>
      <Link to={`/product/${p.slug}`}><h3>{p.name}</h3></Link>
      <p>{p.short_description}</p>
      <div className="product-row">
        <strong>{money(p.price)}</strong>
        <button onClick={()=>{add(p);trackCart();onAdded?.()}} disabled={!p.stock_quantity} aria-label={t('product.addToCart')}><Plus/> {t('product.addBtn')}</button>
      </div>
    </div>
  </article>
}
function Home(){
  const [products,setProducts]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
  const {t}=useI18n();
  useEffect(()=>{
    api('/api/products').then(setProducts).finally(()=>setLoading(false))
  },[]);
  const featured=products.filter(p=>p.featured);
  const trending=[...products].sort((a,b)=>b.trendingScore-a.trendingScore).slice(0,4);
  const bestSellers=[...products].sort((a,b)=>b.purchase_count-a.purchase_count).slice(0,4);
  const arrivals=products.filter(p=>p.isNewArrival).slice(0,4);
  
  return <Layout>
    <section className="hero">
      <div className="hero-bg"/>
      <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}}>
        <p className="eyebrow gold">KEN'S SHOP</p>
        <h1>{t('home.subtitle')}<br/><em>{t('home.subtitleEm')}</em></h1>
        <p>{t('home.description')}</p>
        <Link className="btn gold-btn" to="/shop">{t('home.exploreBtn')} <ArrowRight/></Link>
      </motion.div>
    </section>
    {loading?<Loading/>:<>
      {featured.length>0&&<ProductSection title={t('home.featuredTitle')} subtitle={t('home.featuredSub')} products={featured} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {trending.length>0&&<ProductSection title={t('home.trendingTitle')} subtitle={t('home.trendingSub')} products={trending} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {bestSellers.length>0&&<ProductSection title={t('home.bestSellersTitle')} subtitle={t('home.bestSellersSub')} products={bestSellers} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      {arrivals.length>0&&<ProductSection title={t('home.newArrivalsTitle')} subtitle={t('home.newArrivalsSub')} products={arrivals} onAdded={()=>setToast(t('home.addedToBag'))}/>}
      <section className="simple-contact">
        <div>
          <p className="eyebrow gold">{t('home.personalService')}</p>
          <h2>{t('home.questionsTitle')}</h2>
          <p>{t('home.questionsDesc')}</p>
        </div>
        <a href="https://wa.me/15551234567" className="btn gold-btn"><MessageCircle/> WhatsApp</a>
      </section>
    </>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function ProductSection({title,subtitle,products,onAdded}:{title:string;subtitle:string;products:Product[];onAdded:()=>void}){const {t}=useI18n();return <section className="products-section"><div className="section-head"><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><Link to="/shop">{t('home.viewAll')} <ArrowRight/></Link></div><div className="product-grid">{products.map(p=><ProductCard key={p.id} p={p} onAdded={onAdded}/>)}</div></section>}
function Loading(){const {t}=useI18n();return <div className="loading"><Loader2 className="spin"/></div>}
function Shop(){
  const [products,setProducts]=useState<Product[]>([]);
  const [cats,setCats]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState('');
  const [cat,setCat]=useState(new URLSearchParams(location.search).get('category')||'all');
  const [sort,setSort]=useState('ranking');
  const [toast,setToast]=useState('');
  const {t}=useI18n();
  
  useEffect(()=>{
    Promise.all([api('/api/products'),api('/api/categories')])
      .then(([p,c])=>{setProducts(p);setCats(c)})
      .finally(()=>setLoading(false))
  },[]);
  
  let filtered=products.filter(p=>(cat==='all'||String(p.category_id)===cat)&&p.name.toLowerCase().includes(q.toLowerCase()));
  if(sort==='trending') filtered.sort((a,b)=>b.trendingScore-a.trendingScore);
  else if(sort==='best') filtered.sort((a,b)=>b.purchase_count-a.purchase_count);
  else if(sort==='newest') filtered.sort((a,b)=>new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  else if(sort==='price-asc') filtered.sort((a,b)=>a.price-b.price);
  else if(sort==='price-desc') filtered.sort((a,b)=>b.price-a.price);
  else if(sort==='availability') filtered.sort((a,b)=>a.stockPriority-b.stockPriority);
  else if(sort==='az') filtered.sort((a,b)=>a.name.localeCompare(b.name));

  return <Layout>
    <section className="page-hero">
      <p className="eyebrow gold">{t('shop.eyebrow')}</p>
      <h1>{t('shop.title')}</h1>
    </section>
    <section className="catalog">
      <div className="filters">
        <label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('shop.search')}/></label>
        <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
          <span style={{fontSize:'12px',textTransform:'uppercase',letterSpacing:'1px',opacity:0.6}}>{t('shop.sortLabel')}</span>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:'8px', background:'var(--bg)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:'0'}}>
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
        <div>
          <button className={cat==='all'?'active':''} onClick={()=>setCat('all')}>{t('shop.categoryAll')}</button>
          {cats.map(c=><button key={c.id} className={cat===String(c.id)?'active':''} onClick={()=>setCat(String(c.id))}>{c.name}</button>)}
        </div>
      </div>
      {loading?<Loading/>:filtered.length?<div className="product-grid">{filtered.map(p=><ProductCard key={p.id} p={p} onAdded={()=>setToast(t('home.addedToBag'))}/>)}</div>:<Empty text={t('shop.emptyTitle')} action={<button className="btn" onClick={()=>setQ('')}>{t('shop.emptyAction')}</button>}/>}
    </section>
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function ProductDetail(){
  const {slug}=useParams();
  const {add}=useCart();
  const [p,setP]=useState<Product|null>(null);
  const [related,setRelated]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
  const {t}=useI18n();
  
  useEffect(()=>{
    api(`/api/products?slug=${slug}`).then(d=>{
      setP(d.product);
      setRelated(d.related);
      if(d.product){
        api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: d.product.id, event_type: 'view'})}).catch(console.error);
      }
    }).catch(console.error).finally(()=>setLoading(false))
  },[slug]);

  if(loading)return <Layout><Loading/></Layout>;
  if(!p)return <Layout><Empty text={t('shop.emptyTitle')}/></Layout>;
  
  return <Layout>
    <div className="product-detail">
      <div className="gallery"><img src={p.images?.[0]} alt={p.name}/></div>
      <div className="info">
        <p className="eyebrow gold">{p.category?.name||'KENS'}</p>
        <h1>{p.name}</h1>
        <p className="price">{money(p.price)}</p>
        <p className="desc">{p.description}</p>
        {(p.colors?.length>0||p.models?.length>0)&&<div className="options">
          {p.colors?.length>0&&<div><span>{t('product.color')}</span><div>{p.colors.map(c=><span key={c} className="opt">{c}</span>)}</div></div>}
          {p.models?.length>0&&<div><span>{t('product.model')}</span><div>{p.models.map(m=><span key={m} className="opt">{m}</span>)}</div></div>}
        </div>}
        <button className="btn gold-btn" onClick={()=>{add(p);setToast(t('home.addedToBag'));api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);}} disabled={!p.stock_quantity}>{p.stock_quantity?t('product.addToCart'):t('product.outOfStock')}</button>
        <div className="meta"><span><Truck/> {t('product.assurance')}</span><span><Package/> Signature packaging</span></div>
      </div>
    </div>
    {related.length>0&&<ProductSection title={t('home.trendingTitle')} subtitle="" products={related} onAdded={()=>setToast(t('home.addedToBag'))}/>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function Cart(){
  const {items,update,remove,total,clear}=useCart();
  const [ordering,setOrdering]=useState(false);
  const [error,setError]=useState('');
  const {t}=useI18n();
  const order=async()=>{
    setOrdering(true);setError('');
    try{
      const d=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map((x:any)=>({product_id:x.product.id,product_name:x.product.name,price:x.product.price,quantity:x.quantity,color:x.color,model:x.model})),total})});
      const lines=items.map((x:any)=>`• ${x.product.name}${x.color?` · ${x.color}`:''}${x.model?` · ${x.model}`:''} × ${x.quantity}`).join('\n');
      const text=t('cart.whatsappMessage', d.order_number, lines, money(total));
      clear();
      window.open(`https://wa.me/15551234567?text=${encodeURIComponent(text)}`,'_blank')
    }catch(e:any){setError(e.message)}finally{setOrdering(false)}
  };
  return <Layout><section className="cart-page"><div className="section-head"><div><p className="eyebrow gold">{t('cart.eyebrow')}</p><h1>{t('cart.title')}</h1></div><span>{items.length} {items.length===1?t('cart.pieces'):t('cart.piecesPlural')}</span></div>{items.length?<div className="cart-layout"><div>{items.map((x:any,i:number)=><article className="cart-item" key={`${x.product.id}-${i}`}><img src={x.product.images[0]} alt={x.product.name}/><div><h3>{x.product.name}</h3><p>{[x.color,x.model].filter(Boolean).join(' · ')}</p><strong>{money(x.product.price)}</strong><div className="quantity"><button onClick={()=>update(i,x.quantity-1)}><Minus/></button><span>{x.quantity}</span><button onClick={()=>update(i,x.quantity+1)}><Plus/></button></div></div><button className="remove" onClick={()=>remove(i)}><Trash2/></button></article>)}</div><aside className="summary"><p className="eyebrow">{t('cart.summaryEyebrow')}</p><div><span>{t('cart.subtotal')}</span><b>{money(total)}</b></div><div><span>{t('cart.delivery')}</span><b>{t('cart.deliveryNote')}</b></div><hr/><div className="grand"><span>{t('cart.total')}</span><b>{money(total)}</b></div><button className="btn gold-btn" onClick={order} disabled={ordering}>{ordering?<Loader2 className="spin"/>:<MessageCircle/>} {t('cart.orderBtn')}</button>{error&&<p className="error">{error}</p>}<p className="fine">{t('cart.finePrint')}</p><Link to="/shop"><ChevronLeft/> {t('cart.continue')}</Link></aside></div>:<Empty text={t('cart.emptyText')} action={<Link className="btn dark-btn" to="/shop">{t('cart.emptyBtn')}</Link>}/>}</section></Layout>
}
function Empty({text,action}:{text:string;action?:React.ReactNode}){return <div className="empty"><Gem/><h3>{text}</h3>{action}</div>}
function useAdminNoIndex(){useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow, noarchive';document.head.appendChild(meta);const oldTitle=document.title;document.title='Private Portal';return()=>{meta.remove();document.title=oldTitle}},[])}
function Protected({children}:{children:React.ReactNode}){const {user,loading}=useAuth();if(loading)return <Loading/>;return user?children:<Navigate to="/admin/login" replace/>}
function Login(){
  useAdminNoIndex();const {user}=useAuth();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const {t}=useI18n();
  if(user)return <Navigate to="/admin/products" replace/>;
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(t('admin.invalidLogin'));setBusy(false)};
  return <main className="login"><span className="brand inverse">Ken's <span>Shop</span></span><div className="login-card"><p className="eyebrow gold">{t('admin.loginPortal')}</p><h1>{t('admin.loginTitle')}</h1><p>{t('admin.loginSub')}</p><form onSubmit={submit}><label>{t('admin.email')}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label>{t('admin.password')}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={6} required/></label>{error&&<p className="error">{error}</p>}<button className="btn gold-btn" disabled={busy}>{busy?<Loader2 className="spin"/>:t('admin.signInBtn')}</button></form></div></main>
}
function AdminShell({children}:{children:React.ReactNode}){
  useAdminNoIndex();const [open,setOpen]=useState(false);const nav=useNavigate();const {t, lang, setLang}=useI18n();
  const logout=async()=>{await supabase.auth.signOut();nav('/admin/login')};
  return <div className="admin"><aside className={open?'open':''}><span className="brand inverse">Ken's <span>Shop</span></span><button className="close-admin" onClick={()=>setOpen(false)}><X/></button><nav><NavLink to="/admin/products"><Gem/> {t('admin.navProducts')}</NavLink><NavLink to="/admin/orders"><Package/> {t('admin.navOrders')}</NavLink></nav><button onClick={logout}><LogOut/> {t('admin.signOut')}</button></aside><div className="admin-main"><header><button onClick={()=>setOpen(true)}><Menu/></button><div style={{display:'flex', gap:'1rem', alignItems:'center'}}><button className="theme-toggle" onClick={()=>setLang(lang==='fr'?'en':'fr')} style={{fontSize: '11px', fontWeight:'bold', letterSpacing:'1px'}}>{lang.toUpperCase()}</button><span>{t('admin.shopManager')}</span><CircleUser/></div></header>{children}</div></div>
}
function AdminDashboard(){
  const [data,setData]=useState<any>(null);
  const {session}=useAuth();
  const {t}=useI18n();
  useEffect(()=>{api('/api/dashboard',{headers:{Authorization:`Bearer ${session?.access_token}`}}).then(setData)},[session]);
  if(!data)return <AdminShell><Loading/></AdminShell>;
  const cards=[[t('admin.stats.totalProducts'),data.totalProducts,Gem],[t('admin.stats.available'),data.available,Check],[t('admin.stats.lowStock'),data.lowStock,TrendingUp],[t('admin.stats.outOfStock'),data.outOfStock,Package],[t('admin.stats.pending'),data.pending,MessageCircle],[t('admin.stats.delivered'),data.delivered,Check]];
  const widgets=[
    {icon:'🔥',label:t('admin.widgets.trending'),product:data.trendingProduct},
    {icon:'🏆',label:t('admin.widgets.bestSeller'),product:data.bestSeller},
    {icon:'👀',label:t('admin.widgets.mostViewed'),product:data.mostViewed},
    {icon:'🛒',label:t('admin.widgets.mostCart'),product:data.mostCart},
    {icon:'💰',label:t('admin.widgets.highestRevenue'),product:data.highestRevenue},
  ];
  return <AdminShell><section className="admin-content">
    <div className="admin-title"><div><p className="eyebrow gold">{t('admin.dashboardEyebrow')}</p><h1>{t('admin.dashboardTitle')}</h1></div><Link to="/admin/products" className="btn gold-btn"><Plus/> {t('admin.addProduct')}</Link></div>
    <div className="stat-grid simple-stats">{cards.map(([n,v,I]:any)=><article key={n}><I/><span>{n}</span><strong>{v}</strong></article>)}</div>
    <div className="admin-title" style={{marginTop:'2rem'}}><div><p className="eyebrow gold">{t('admin.analyticsEyebrow')}</p><h2>{t('admin.analyticsTitle')}</h2></div></div>
    <div className="stat-grid simple-stats">{widgets.map(w=><article key={w.label}><span style={{fontSize:'1.5rem'}}>{w.icon}</span><span>{w.label}</span><strong style={{fontSize:'0.85rem',textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap'}}>{w.product?.name||'—'}</strong></article>)}</div>
    <div className="admin-panels simple-panel"><article><div className="panel-head"><p className="eyebrow">{t('admin.latestOrders')}</p><Link to="/admin/orders">{t('admin.viewAllOrders')}</Link></div>{(data.recent||[]).map((o:any)=><Link className="mini-order" to="/admin/orders" key={o.id}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleDateString()}</span></div><strong>{money(o.total)}</strong><Status status={t(`admin.orderStatuses.${o.status}`)||o.status}/></Link>)}</article></div>
  </section></AdminShell>}
const authHeaders=(token?:string)=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});
function AdminProducts(){const [products,setProducts]=useState<Product[]>([]);const [cats,setCats]=useState<any[]>([]);const [q,setQ]=useState('');const [editing,setEditing]=useState<any>(null);const [error,setError]=useState('');const {session}=useAuth();const {t}=useI18n();const load=()=>Promise.all([api('/api/products?admin=true',{headers:authHeaders(session?.access_token)}),api('/api/categories')]).then(([p,c])=>{setProducts(p);setCats(c)});useEffect(()=>{load()},[]);const del=async(id:number)=>{if(!confirm(t('admin.confirmDelete')))return;await api('/api/products',{method:'DELETE',headers:authHeaders(session?.access_token),body:JSON.stringify({id})});load()};return <AdminShell><section className="admin-content"><div className="admin-title"><div><p className="eyebrow gold">{t('admin.productsEyebrow')}</p><h1>{t('admin.productsTitle')}</h1></div><button className="btn gold-btn" onClick={()=>setEditing({})}><Plus/> {t('admin.addProduct')}</button></div><label className="admin-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('admin.searchProduct')}/></label><div className="table-wrap"><table><thead><tr><th>{t('admin.table.product')}</th><th>{t('admin.table.category')}</th><th>{t('admin.table.price')}</th><th>{t('admin.table.stock')}</th><th></th></tr></thead><tbody>{products.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).map(p=><tr key={p.id}><td><div className="table-product"><img src={p.images[0]}/><div><b>{p.name}</b><span>{p.short_description}</span></div></div></td><td>{p.category?.name}</td><td>{money(p.price)}</td><td><Stock n={p.stock_quantity}/></td><td><button onClick={()=>setEditing(p)}><Pencil/></button><button onClick={()=>del(p.id)}><Trash2/></button></td></tr>)}</tbody></table></div>{editing&&<ProductModal item={editing} cats={cats} token={session?.access_token} close={()=>setEditing(null)} done={()=>{setEditing(null);load()}} error={error} setError={setError}/>}</section></AdminShell>}
function Stock({n}:{n:number}){const {t}=useI18n();return <span className={`stock ${n===0?'out':n<6?'low':''}`}><i/>{n===0?t('admin.stockState.out'):n<6?`${n} · ${t('admin.stockState.low')}`:`${n} ${t('admin.stockState.available')}`}</span>}
function ProductModal({item,cats,token,close,done,error,setError}:any){
  const [form,setForm]=useState({
    name:item.name||'',
    short_description:item.short_description||'',
    description:item.description||'',
    price:item.price||'',
    category_id:item.category_id||cats[0]?.id,
    stock_quantity:item.stock_quantity??1,
    low_stock_threshold:item.low_stock_threshold??5,
    colors:(item.colors||[]).join(', '),
    models:(item.models||[]).join(', '),
    images:item.images||[],
    featured:item.featured||false,
    hidden:item.hidden||false,
    active:item.active??true,
    display_priority:item.display_priority??'',
  });
  const [busy,setBusy]=useState(false);
  const set=(k:string,v:any)=>setForm(x=>({...x,[k]:v}));
  const upload=async(files:FileList|null)=>{
    if(!files)return;setBusy(true);
    try{
      const urls=[];
      for(const file of Array.from(files)){
        const base64=await new Promise<string>((resolve)=>{const r=new FileReader();r.onload=()=>resolve((r.result as string).split(',')[1]);r.readAsDataURL(file)});
        const d=await api('/api/upload',{method:'POST',headers:authHeaders(token),body:JSON.stringify({fileName:`${Date.now()}-${file.name}`,fileBase64:base64,contentType:file.type})});
        urls.push(d.url);
      }
      set('images',[...form.images,...urls]);
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };
  const save=async(e:FormEvent)=>{
    e.preventDefault();
    if(!form.images.length)return setError('Upload at least one image.');
    setBusy(true);setError('');
    try{
      await api('/api/products',{method:item.id?'PUT':'POST',headers:authHeaders(token),body:JSON.stringify({
        ...form,id:item.id,
        price:Number(form.price),
        stock_quantity:Number(form.stock_quantity),
        low_stock_threshold:Number(form.low_stock_threshold),
        display_priority:form.display_priority===''?null:Number(form.display_priority),
        colors:form.colors.split(',').map((x:string)=>x.trim()).filter(Boolean),
        models:form.models.split(',').map((x:string)=>x.trim()).filter(Boolean),
      })});
      done();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  };
  return <div className="modal-bg"><form className="modal" onSubmit={save}>
    <div className="modal-head"><div><p className="eyebrow gold">{item.id?'EDIT PRODUCT':'NEW PRODUCT'}</p><h2>{item.id?'Product details':'Add a product'}</h2></div><button type="button" onClick={close}><X/></button></div>
    <div className="form-grid">
      <label className="full">Product name<input value={form.name} onChange={e=>set('name',e.target.value)} required/></label>
      <label className="full">Short description<input value={form.short_description} onChange={e=>set('short_description',e.target.value)} required/></label>
      <label className="full">Description<textarea value={form.description} onChange={e=>set('description',e.target.value)} required/></label>
      <label>Price (USD)<input type="number" min="0" step="0.01" value={form.price} onChange={e=>set('price',e.target.value)} required/></label>
      <label>Category<select value={form.category_id} onChange={e=>set('category_id',e.target.value)}>{cats.map((c:any)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Stock Quantity<input type="number" min="0" value={form.stock_quantity} onChange={e=>set('stock_quantity',e.target.value)} required/></label>
      <label>Low Stock Threshold<input type="number" min="0" value={form.low_stock_threshold} onChange={e=>set('low_stock_threshold',e.target.value)}/></label>
      <label>Display Priority (optional)<input type="number" min="1" value={form.display_priority} onChange={e=>set('display_priority',e.target.value)} placeholder="e.g. 1 = top"/></label>
      <label>Colors (optional)<input value={form.colors} onChange={e=>set('colors',e.target.value)} placeholder="Black, Gold"/></label>
      <label>Models (optional)<input value={form.models} onChange={e=>set('models',e.target.value)} placeholder="Small, Large"/></label>
      <label className="full upload">Photos<input type="file" accept="image/*" multiple onChange={e=>upload(e.target.files)}/><span><Plus/> {busy?'Uploading…':'Choose photos'}</span></label>
      <div className="image-preview full">{form.images.map((im:string,i:number)=><div key={i}><img src={im}/><button type="button" onClick={()=>set('images',form.images.filter((_:string,n:number)=>n!==i))}><X/></button></div>)}</div>
      <div className="checks full">
        <label><input type="checkbox" checked={form.featured} onChange={e=>set('featured',e.target.checked)}/> ⭐ Featured (always shown first)</label>
        <label><input type="checkbox" checked={form.hidden} onChange={e=>set('hidden',e.target.checked)}/> 🚫 Hidden (not visible in shop)</label>
        <label><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/> ✅ Available for sale</label>
      </div>
    </div>
    {error&&<p className="error">{error}</p>}
    <div className="modal-actions"><button type="button" onClick={close}>Cancel</button><button className="btn gold-btn" disabled={busy}>{busy?<Loader2 className="spin"/>:<Check/>} Save product</button></div>
  </form></div>
}
const statuses=['Pending','Discussing on WhatsApp','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'];
function Status({status}:{status:string}){return <span className={`status s-${status.toLowerCase().replaceAll(' ','-')}`}>{status}</span>}
function AdminOrders(){
  const [orders,setOrders]=useState<any[]>([]);const [selected,setSelected]=useState<any>(null);const [q,setQ]=useState('');const [filter,setFilter]=useState('All');const {session}=useAuth();const {t}=useI18n();
  const load=()=>api('/api/orders',{headers:authHeaders(session?.access_token)}).then(setOrders);useEffect(()=>{load()},[]);
  const shown=orders.filter(o=>(filter==='All'||o.status===filter)&&(o.order_number.toLowerCase().includes(q.toLowerCase())||(o.customer_name||'').toLowerCase().includes(q.toLowerCase())));
  return <AdminShell><section className="admin-content"><div className="admin-title"><div><p className="eyebrow gold">{t('admin.clientOrdersEyebrow')}</p><h1>{t('admin.ordersTitle')}</h1></div></div><div className="order-tools"><label className="admin-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder={t('admin.searchOrder')}/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">{t('admin.filterAll')}</option>{statuses.map(s=><option key={s} value={s}>{t(`admin.orderStatuses.${s}`)||s}</option>)}</select></div><div className="order-list">{shown.map(o=><button key={o.id} onClick={()=>setSelected(o)}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleString()}</span></div><div><b>{o.customer_name||t('admin.whatsappClient')}</b><span>{o.items?.length} {t('cart.piecesPlural')}</span></div><strong>{money(o.total)}</strong><Status status={t(`admin.orderStatuses.${o.status}`)||o.status}/><ChevronRight/></button>)}</div>{!shown.length&&<Empty text={t('admin.noOrders')}/>}{selected&&<OrderDrawer order={selected} token={session?.access_token} close={()=>setSelected(null)} done={()=>{setSelected(null);load()}}/>}</section></AdminShell>
}
function OrderDrawer({order,token,close,done}:any){
  const [form,setForm]=useState({...order});const [busy,setBusy]=useState(false);const {t}=useI18n();
  const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));const save=async(status?:string)=>{setBusy(true);await api('/api/orders',{method:'PUT',headers:authHeaders(token),body:JSON.stringify({...form,status:status||form.status})});setBusy(false);done()};const wa=form.whatsapp_number?.replace(/\D/g,'')||'15551234567';
  return <div className="drawer-bg" onClick={close}><aside className="drawer" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow gold">{form.order_number}</p><h2>{t('admin.orderDetails')}</h2></div><button onClick={close}><X/></button></div><Status status={t(`admin.orderStatuses.${form.status}`)||form.status}/><div className="drawer-items">{form.items.map((x:any,i:number)=><div key={i}><img src={x.product?.images?.[0]}/><span><b>{x.product_name}</b><small>{[x.color,x.model].filter(Boolean).join(' · ')} · {t('admin.qty')} {x.quantity}</small></span><strong>{money(x.price*x.quantity)}</strong></div>)}</div><div className="drawer-total"><span>{t('cart.total')}</span><b>{money(form.total)}</b></div><h3>{t('admin.customerInfo')}</h3><div className="form-grid"><label>{t('admin.name')}<input value={form.customer_name||''} onChange={e=>set('customer_name',e.target.value)}/></label><label>{t('admin.waNumber')}<input value={form.whatsapp_number||''} onChange={e=>set('whatsapp_number',e.target.value)}/></label><label className="full">{t('admin.address')}<textarea value={form.address||''} onChange={e=>set('address',e.target.value)}/></label><label className="full">{t('admin.gps')}<input value={form.gps_location||''} onChange={e=>set('gps_location',e.target.value)}/></label><label>{t('admin.paymentMethod')}<input value={form.payment_method||''} onChange={e=>set('payment_method',e.target.value)}/></label><label>{t('admin.deliveryInstructions')}<input value={form.delivery_instructions||''} onChange={e=>set('delivery_instructions',e.target.value)}/></label><label className="full">{t('admin.status')}<select value={form.status} onChange={e=>set('status',e.target.value)}>{statuses.map(s=><option key={s} value={s}>{t(`admin.orderStatuses.${s}`)||s}</option>)}</select></label></div><div className="quick"><a href={`https://wa.me/${wa}?text=${encodeURIComponent(t('admin.waMessagePrefix')+' '+form.order_number)}`} target="_blank"><MessageCircle/> WhatsApp</a><button onClick={()=>navigator.clipboard.writeText(form.address||'')}><Copy/> {t('admin.address')}</button><button onClick={()=>navigator.clipboard.writeText(form.gps_location||'')}><MapPin/> {t('admin.gps')}</button></div><div className="modal-actions"><button className="danger" onClick={()=>save('Cancelled')}>{t('admin.cancelOrder')}</button><button className="btn dark-btn" onClick={()=>save('Delivered')}>{t('admin.markDelivered')}</button><button className="btn gold-btn" onClick={()=>save()} disabled={busy}>{busy?<Loader2 className="spin"/>:<Check/>} {t('admin.save')}</button></div></aside></div>
}
export default function App(){
  return <ThemeProvider><I18nProvider><Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:slug" element={<ProductDetail/>}/><Route path="/cart" element={<Cart/>}/><Route path="/admin/login" element={<Login/>}/><Route path="/admin" element={<Protected><Navigate to="/admin/products" replace/></Protected>}/><Route path="/admin/products" element={<Protected><AdminProducts/></Protected>}/><Route path="/admin/orders" element={<Protected><AdminOrders/></Protected>}/><Route path="*" element={<Navigate to="/"/>}/></Routes></I18nProvider></ThemeProvider>
}
