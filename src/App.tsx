import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Routes, Route, Link, NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleUser, Copy, Gauge, Gem, Instagram, Loader2, LogOut, MapPin, Menu, MessageCircle, Minus, Package, Pencil, Plus, Search, ShoppingBag, Sparkles, Star, Trash2, TrendingUp, X } from 'lucide-react';
import { useCart, type Product } from './contexts/CartContext';
import { useAuth } from './contexts/AuthContext';
import supabase from './lib/supabase';
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
async function api(path:string, options?:RequestInit){const r=await fetch(path,options);const d=await r.json();if(!r.ok)throw new Error(d.error||'Something went wrong');return d}
function Toast({text,onClose}:{text:string;onClose:()=>void}){useEffect(()=>{const t=setTimeout(onClose,2600);return()=>clearTimeout(t)},[onClose]);return <motion.div initial={{y:20,opacity:0}} animate={{y:0,opacity:1}} exit={{y:20,opacity:0}} className="toast"><Check size={16}/>{text}</motion.div>}
function Header(){const {count}=useCart();const [open,setOpen]=useState(false);return <header className="header"><Link to="/" className="brand">KENS <span>SHOP</span></Link><nav className={open?'nav open':'nav'}>{[['/','Home'],['/shop','Catalog']].map(([to,n])=><Link key={n} to={to} onClick={()=>setOpen(false)}>{n}</Link>)}</nav><div className="head-actions"><Link to="/cart" className="bag" aria-label="Cart"><ShoppingBag/><b>{count}</b></Link><button className="menu" onClick={()=>setOpen(!open)} aria-label="Menu">{open?<X/>:<Menu/>}</button></div></header>}
function Footer(){return <footer><div><Link to="/" className="brand inverse">KENS <span>SHOP</span></Link><p>A small, considered catalog of perfumes, watches, jewelry and accessories.</p></div><div><b>Shop</b><Link to="/shop">View catalog</Link><a href="https://wa.me/15551234567">WhatsApp</a></div><div><b>Contact</b><a href="https://instagram.com" target="_blank">Instagram</a><a href="mailto:concierge@kensshop.com">Email</a></div><small>© 2025 KENS SHOP.</small></footer>}
function Layout({children}:{children:React.ReactNode}){return <><Header/><main>{children}</main><Footer/><a className="float-wa" href="https://wa.me/15551234567" target="_blank" aria-label="WhatsApp"><MessageCircle/></a></>}
function ProductCard({p,onAdded}:{p:Product;onAdded?:()=>void}){
  const {add}=useCart();
  const trackCart = () => {
    api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);
  };
  return <article className="product-card">
    <Link to={`/product/${p.slug}`} className="product-image">
      <img src={p.images?.[0]} alt={p.name} loading="lazy"/>
      <span className="inventory-badge" style={{
        background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '11px', padding: '4px 8px', borderRadius: '4px'
      }}>
        {p.stockPriority===1?'🟢 In Stock':p.stockPriority===2?'🟡 Limited Stock':'🔴 Out of Stock'}
      </span>
    </Link>
    <div>
      <p className="eyebrow">{p.category?.name||'KENS selection'}</p>
      <Link to={`/product/${p.slug}`}><h3>{p.name}</h3></Link>
      <p>{p.short_description}</p>
      <div className="product-row">
        <strong>{money(p.price)}</strong>
        <button onClick={()=>{add(p);trackCart();onAdded?.()}} disabled={!p.stock_quantity} aria-label="Add to cart"><Plus/> Add</button>
      </div>
    </div>
  </article>
}
function Home(){
  const [products,setProducts]=useState<Product[]>([]);
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
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
        <p className="eyebrow gold">KENS SHOP</p>
        <h1>Quiet luxury.<br/><em>Simply chosen.</em></h1>
        <p>A small catalog of exceptional perfumes, watches, jewelry and accessories.</p>
        <Link className="btn gold-btn" to="/shop">Explore the collection <ArrowRight/></Link>
      </motion.div>
    </section>
    {loading?<Loading/>:<>
      {featured.length>0&&<ProductSection title="Featured Collection" subtitle="HANDPICKED" products={featured} onAdded={()=>setToast('Added to your bag')}/>}
      {trending.length>0&&<ProductSection title="Trending Now" subtitle="MOST DESIRED" products={trending} onAdded={()=>setToast('Added to your bag')}/>}
      {bestSellers.length>0&&<ProductSection title="Best Sellers" subtitle="CLASSICS" products={bestSellers} onAdded={()=>setToast('Added to your bag')}/>}
      {arrivals.length>0&&<ProductSection title="New Arrivals" subtitle="RECENTLY ADDED" products={arrivals} onAdded={()=>setToast('Added to your bag')}/>}
      <section className="simple-contact">
        <div>
          <p className="eyebrow gold">PERSONAL SERVICE</p>
          <h2>Questions? Message us.</h2>
          <p>We confirm availability, delivery and payment with you directly.</p>
        </div>
        <a href="https://wa.me/15551234567" className="btn gold-btn"><MessageCircle/> WhatsApp</a>
      </section>
    </>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function ProductSection({title,subtitle,products,onAdded}:{title:string;subtitle:string;products:Product[];onAdded:()=>void}){return <section className="products-section"><div className="section-head"><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><Link to="/shop">View all <ArrowRight/></Link></div><div className="product-grid">{products.map(p=><ProductCard key={p.id} p={p} onAdded={onAdded}/>)}</div></section>}
function Loading(){return <div className="loading"><Loader2 className="spin"/><span>Curating your experience…</span></div>}
function Shop(){
  const [products,setProducts]=useState<Product[]>([]);
  const [cats,setCats]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState('');
  const [cat,setCat]=useState(new URLSearchParams(location.search).get('category')||'all');
  const [sort,setSort]=useState('ranking');
  const [toast,setToast]=useState('');
  
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
      <p className="eyebrow gold">THE COLLECTION</p>
      <h1>Considered objects.<br/><em>Enduring pleasure.</em></h1>
    </section>
    <section className="catalog">
      <div className="filters">
        <label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search the collection"/></label>
        <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
          <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:'8px', background:'var(--bg)', color:'var(--fg)', border:'1px solid var(--border)', borderRadius:'0'}}>
            <option value="ranking">Master Ranking</option>
            <option value="trending">Trending Now</option>
            <option value="best">Best Sellers</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price (Low to High)</option>
            <option value="price-desc">Price (High to Low)</option>
            <option value="availability">Availability</option>
            <option value="az">A-Z</option>
          </select>
        </div>
        <div>
          <button className={cat==='all'?'active':''} onClick={()=>setCat('all')}>All</button>
          {cats.map(c=><button key={c.id} className={cat===String(c.id)?'active':''} onClick={()=>setCat(String(c.id))}>{c.name}</button>)}
        </div>
      </div>
      {loading?<Loading/>:filtered.length?<div className="product-grid">{filtered.map(p=><ProductCard key={p.id} p={p} onAdded={()=>setToast('Added to your selection')}/>)}</div>:<Empty text="No pieces match your search."/>}
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
  if(!p)return <Layout><Empty text="Product not found"/></Layout>;
  
  return <Layout>
    <div className="product-detail">
      <div className="gallery"><img src={p.images?.[0]} alt={p.name}/></div>
      <div className="info">
        <p className="eyebrow gold">{p.category?.name||'KENS'}</p>
        <h1>{p.name}</h1>
        <p className="price">{money(p.price)}</p>
        <p className="desc">{p.description}</p>
        {(p.colors?.length>0||p.models?.length>0)&&<div className="options">
          {p.colors?.length>0&&<div><span>Color</span><div>{p.colors.map(c=><span key={c} className="opt">{c}</span>)}</div></div>}
          {p.models?.length>0&&<div><span>Model</span><div>{p.models.map(m=><span key={m} className="opt">{m}</span>)}</div></div>}
        </div>}
        <button className="btn gold-btn" onClick={()=>{add(p);setToast('Added to bag');api('/api/track', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({product_id: p.id, event_type: 'cart'})}).catch(console.error);}} disabled={!p.stock_quantity}>{p.stock_quantity?'Add to bag':'Sold out'}</button>
        <div className="meta"><span><Truck/> Complimentary delivery</span><span><Package/> Signature packaging</span></div>
      </div>
    </div>
    {related.length>0&&<ProductSection title="Related pieces" subtitle="YOU MAY ALSO LIKE" products={related} onAdded={()=>setToast('Added')}/>}
    <AnimatePresence>{toast&&<Toast text={toast} onClose={()=>setToast('')}/>}</AnimatePresence>
  </Layout>
}
function Cart(){const {items,update,remove,total,clear}=useCart();const [ordering,setOrdering]=useState(false);const [error,setError]=useState('');const order=async()=>{setOrdering(true);setError('');try{const d=await api('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items.map((x:any)=>({product_id:x.product.id,product_name:x.product.name,price:x.product.price,quantity:x.quantity,color:x.color,model:x.model})),total})});const lines=items.map((x:any)=>`• ${x.product.name}${x.color?` · ${x.color}`:''}${x.model?` · ${x.model}`:''} × ${x.quantity}`).join('\n');const text=`Hello,\n\nI would like to place the following order (${d.order_number}):\n\n${lines}\n\nTotal: ${money(total)}\n\nI would like more information regarding delivery.\n\nThank you.`;clear();window.open(`https://wa.me/15551234567?text=${encodeURIComponent(text)}`,'_blank')}catch(e:any){setError(e.message)}finally{setOrdering(false)}};return <Layout><section className="cart-page"><div className="section-head"><div><p className="eyebrow gold">YOUR SELECTION</p><h1>Shopping bag</h1></div><span>{items.length} {items.length===1?'piece':'pieces'}</span></div>{items.length?<div className="cart-layout"><div>{items.map((x:any,i:number)=><article className="cart-item" key={`${x.product.id}-${i}`}><img src={x.product.images[0]} alt={x.product.name}/><div><h3>{x.product.name}</h3><p>{[x.color,x.model].filter(Boolean).join(' · ')}</p><strong>{money(x.product.price)}</strong><div className="quantity"><button onClick={()=>update(i,x.quantity-1)}><Minus/></button><span>{x.quantity}</span><button onClick={()=>update(i,x.quantity+1)}><Plus/></button></div></div><button className="remove" onClick={()=>remove(i)}><Trash2/></button></article>)}</div><aside className="summary"><p className="eyebrow">ORDER SUMMARY</p><div><span>Subtotal</span><b>{money(total)}</b></div><div><span>Delivery</span><b>Discuss via WhatsApp</b></div><hr/><div className="grand"><span>Total</span><b>{money(total)}</b></div><button className="btn gold-btn" onClick={order} disabled={ordering}>{ordering?<Loader2 className="spin"/>:<MessageCircle/>} Order via WhatsApp</button>{error&&<p className="error">{error}</p>}<p className="fine">Your order is reserved in our system before WhatsApp opens. No payment is collected online.</p><Link to="/shop"><ChevronLeft/> Continue shopping</Link></aside></div>:<Empty text="Your selection is waiting for something exceptional." action={<Link className="btn dark-btn" to="/shop">Explore collection</Link>}/>}</section></Layout>}
function Empty({text,action}:{text:string;action?:React.ReactNode}){return <div className="empty"><Gem/><h3>{text}</h3>{action}</div>}
function useAdminNoIndex(){useEffect(()=>{const meta=document.createElement('meta');meta.name='robots';meta.content='noindex, nofollow, noarchive';document.head.appendChild(meta);const oldTitle=document.title;document.title='Private Portal';return()=>{meta.remove();document.title=oldTitle}},[])}
function Protected({children}:{children:React.ReactNode}){const {user,loading}=useAuth();if(loading)return <Loading/>;return user?children:<Navigate to="/admin/login" replace/>}
function Login(){useAdminNoIndex();const {user}=useAuth();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);if(user)return <Navigate to="/admin/products" replace/>;const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError('Invalid email or password.');setBusy(false)};return <main className="login"><span className="brand inverse">KENS <span>SHOP</span></span><div className="login-card"><p className="eyebrow gold">PRIVATE PORTAL</p><h1>Owner sign in.</h1><p>Authorized access only.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" minLength={6} required/></label>{error&&<p className="error">{error}</p>}<button className="btn gold-btn" disabled={busy}>{busy?<Loader2 className="spin"/>:'Sign in'}</button></form></div></main>}
function AdminShell({children}:{children:React.ReactNode}){useAdminNoIndex();const [open,setOpen]=useState(false);const nav=useNavigate();const logout=async()=>{await supabase.auth.signOut();nav('/admin/login')};return <div className="admin"><aside className={open?'open':''}><span className="brand inverse">KENS <span>SHOP</span></span><button className="close-admin" onClick={()=>setOpen(false)}><X/></button><nav><NavLink to="/admin/products"><Gem/> Products</NavLink><NavLink to="/admin/orders"><Package/> Orders</NavLink></nav><button onClick={logout}><LogOut/> Sign out</button></aside><div className="admin-main"><header><button onClick={()=>setOpen(true)}><Menu/></button><div><span>Shop Manager</span><CircleUser/></div></header>{children}</div></div>}
function AdminDashboard(){
  const [data,setData]=useState<any>(null);
  const {session}=useAuth();
  useEffect(()=>{api('/api/dashboard',{headers:{Authorization:`Bearer ${session?.access_token}`}}).then(setData)},[session]);
  if(!data)return <AdminShell><Loading/></AdminShell>;
  const cards=[['Total Products',data.totalProducts,Gem],['In Stock',data.available,Check],['Low Stock',data.lowStock,TrendingUp],['Out of Stock',data.outOfStock,Package],['Pending Orders',data.pending,MessageCircle],['Delivered',data.delivered,Check]];
  const widgets=[
    {icon:'🔥',label:'Trending',product:data.trendingProduct},
    {icon:'🏆',label:'Best Seller',product:data.bestSeller},
    {icon:'👀',label:'Most Viewed',product:data.mostViewed},
    {icon:'🛒',label:'Most Added to Cart',product:data.mostCart},
    {icon:'💰',label:'Highest Revenue',product:data.highestRevenue},
  ];
  return <AdminShell><section className="admin-content">
    <div className="admin-title"><div><p className="eyebrow gold">YOUR SHOP</p><h1>Overview</h1></div><Link to="/admin/products" className="btn gold-btn"><Plus/> Add product</Link></div>
    <div className="stat-grid simple-stats">{cards.map(([n,v,I]:any)=><article key={n}><I/><span>{n}</span><strong>{v}</strong></article>)}</div>
    <div className="admin-title" style={{marginTop:'2rem'}}><div><p className="eyebrow gold">INTELLIGENCE</p><h2>Sales Analytics</h2></div></div>
    <div className="stat-grid simple-stats">{widgets.map(w=><article key={w.label}><span style={{fontSize:'1.5rem'}}>{w.icon}</span><span>{w.label}</span><strong style={{fontSize:'0.85rem',textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap'}}>{w.product?.name||'—'}</strong></article>)}</div>
    <div className="admin-panels simple-panel"><article><div className="panel-head"><p className="eyebrow">LATEST ORDERS</p><Link to="/admin/orders">View all</Link></div>{(data.recent||[]).map((o:any)=><Link className="mini-order" to="/admin/orders" key={o.id}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleDateString()}</span></div><strong>{money(o.total)}</strong><Status status={o.status}/></Link>)}</article></div>
  </section></AdminShell>}
const authHeaders=(token?:string)=>({'Content-Type':'application/json',Authorization:`Bearer ${token}`});
function AdminProducts(){const [products,setProducts]=useState<Product[]>([]);const [cats,setCats]=useState<any[]>([]);const [q,setQ]=useState('');const [editing,setEditing]=useState<any>(null);const [error,setError]=useState('');const {session}=useAuth();const load=()=>Promise.all([api('/api/products?admin=true',{headers:authHeaders(session?.access_token)}),api('/api/categories')]).then(([p,c])=>{setProducts(p);setCats(c)});useEffect(()=>{load()},[]);const del=async(id:number)=>{if(!confirm('Delete this product?'))return;await api('/api/products',{method:'DELETE',headers:authHeaders(session?.access_token),body:JSON.stringify({id})});load()};return <AdminShell><section className="admin-content"><div className="admin-title"><div><p className="eyebrow gold">INVENTORY</p><h1>Products</h1></div><button className="btn gold-btn" onClick={()=>setEditing({})}><Plus/> Add product</button></div><label className="admin-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by product name"/></label><div className="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead><tbody>{products.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())).map(p=><tr key={p.id}><td><div className="table-product"><img src={p.images[0]}/><div><b>{p.name}</b><span>{p.short_description}</span></div></div></td><td>{p.category?.name}</td><td>{money(p.price)}</td><td><Stock n={p.stock_quantity}/></td><td><button onClick={()=>setEditing(p)}><Pencil/></button><button onClick={()=>del(p.id)}><Trash2/></button></td></tr>)}</tbody></table></div>{editing&&<ProductModal item={editing} cats={cats} token={session?.access_token} close={()=>setEditing(null)} done={()=>{setEditing(null);load()}} error={error} setError={setError}/>}</section></AdminShell>}
function Stock({n}:{n:number}){return <span className={`stock ${n===0?'out':n<6?'low':''}`}><i/>{n===0?'Out of stock':n<6?`${n} · Low`:`${n} available`}</span>}
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
function AdminOrders(){const [orders,setOrders]=useState<any[]>([]);const [selected,setSelected]=useState<any>(null);const [q,setQ]=useState('');const [filter,setFilter]=useState('All');const {session}=useAuth();const load=()=>api('/api/orders',{headers:authHeaders(session?.access_token)}).then(setOrders);useEffect(()=>{load()},[]);const shown=orders.filter(o=>(filter==='All'||o.status===filter)&&(o.order_number.toLowerCase().includes(q.toLowerCase())||(o.customer_name||'').toLowerCase().includes(q.toLowerCase())));return <AdminShell><section className="admin-content"><div className="admin-title"><div><p className="eyebrow gold">CLIENT ORDERS</p><h1>Orders</h1></div></div><div className="order-tools"><label className="admin-search"><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Order number or client"/></label><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option>{statuses.map(s=><option>{s}</option>)}</select></div><div className="order-list">{shown.map(o=><button key={o.id} onClick={()=>setSelected(o)}><div><b>{o.order_number}</b><span>{new Date(o.created_at).toLocaleString()}</span></div><div><b>{o.customer_name||'WhatsApp client'}</b><span>{o.items?.length} items</span></div><strong>{money(o.total)}</strong><Status status={o.status}/><ChevronRight/></button>)}</div>{!shown.length&&<Empty text="No orders found."/>}{selected&&<OrderDrawer order={selected} token={session?.access_token} close={()=>setSelected(null)} done={()=>{setSelected(null);load()}}/>}</section></AdminShell>}
function OrderDrawer({order,token,close,done}:any){const [form,setForm]=useState({...order});const [busy,setBusy]=useState(false);const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));const save=async(status?:string)=>{setBusy(true);await api('/api/orders',{method:'PUT',headers:authHeaders(token),body:JSON.stringify({...form,status:status||form.status})});setBusy(false);done()};const wa=form.whatsapp_number?.replace(/\D/g,'')||'15551234567';return <div className="drawer-bg" onClick={close}><aside className="drawer" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow gold">{form.order_number}</p><h2>Order details</h2></div><button onClick={close}><X/></button></div><Status status={form.status}/><div className="drawer-items">{form.items.map((x:any)=><div><img src={x.product?.images?.[0]}/><span><b>{x.product_name}</b><small>{[x.color,x.model].filter(Boolean).join(' · ')} · Qty {x.quantity}</small></span><strong>{money(x.price*x.quantity)}</strong></div>)}</div><div className="drawer-total"><span>Total</span><b>{money(form.total)}</b></div><h3>Customer information</h3><div className="form-grid"><label>Name<input value={form.customer_name||''} onChange={e=>set('customer_name',e.target.value)}/></label><label>WhatsApp number<input value={form.whatsapp_number||''} onChange={e=>set('whatsapp_number',e.target.value)}/></label><label className="full">Address<textarea value={form.address||''} onChange={e=>set('address',e.target.value)}/></label><label className="full">GPS location<input value={form.gps_location||''} onChange={e=>set('gps_location',e.target.value)}/></label><label>Payment method<input value={form.payment_method||''} onChange={e=>set('payment_method',e.target.value)}/></label><label>Delivery instructions<input value={form.delivery_instructions||''} onChange={e=>set('delivery_instructions',e.target.value)}/></label><label className="full">Status<select value={form.status} onChange={e=>set('status',e.target.value)}>{statuses.map(s=><option>{s}</option>)}</select></label></div><div className="quick"><a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hello, regarding order ${form.order_number}`)}`} target="_blank"><MessageCircle/> WhatsApp</a><button onClick={()=>navigator.clipboard.writeText(form.address||'')}><Copy/> Address</button><button onClick={()=>navigator.clipboard.writeText(form.gps_location||'')}><MapPin/> GPS</button></div><div className="modal-actions"><button className="danger" onClick={()=>save('Cancelled')}>Cancel order</button><button className="btn dark-btn" onClick={()=>save('Delivered')}>Mark delivered</button><button className="btn gold-btn" onClick={()=>save()} disabled={busy}>{busy?<Loader2 className="spin"/>:<Check/>} Save</button></div></aside></div>}
export default function App(){return <Routes><Route path="/" element={<Home/>}/><Route path="/shop" element={<Shop/>}/><Route path="/product/:slug" element={<ProductDetail/>}/><Route path="/cart" element={<Cart/>}/><Route path="/admin/login" element={<Login/>}/><Route path="/admin" element={<Protected><Navigate to="/admin/products" replace/></Protected>}/><Route path="/admin/products" element={<Protected><AdminProducts/></Protected>}/><Route path="/admin/orders" element={<Protected><AdminOrders/></Protected>}/><Route path="*" element={<Navigate to="/"/>}/></Routes>}
