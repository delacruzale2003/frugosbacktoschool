'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { 
  Store, 
  ChevronRight, 
  Camera, 
  CheckCircle2, 
  Loader2, 
  Image as ImageIcon,
  ArrowLeft,
  PartyPopper,
  AlertCircle,
  Gift
} from 'lucide-react'

// --- CONFIGURACIÓN DE SUPABASE ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function RegistrationApp() {
  // --- CONFIGURACIÓN DE CAMPAÑA ---
  const CAMPAIGN_NAME = process.env.NEXT_PUBLIC_CAMPAIGN || 'FrugosBacktoSchool'

  // --- ESTADOS ---
  const [step, setStep] = useState<1 | 2 | 3>(1) // 1: Tiendas, 2: Formulario, 3: Éxito
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  const [campaign, setCampaign] = useState<any>(null)
  const [stores, setStores] = useState<any[]>([])
  const [selectedStore, setSelectedStore] = useState<any>(null)
  
  const [formData, setFormData] = useState({ fullName: '' })
  const [file, setFile] = useState<File | null>(null)
  
  // Estado para guardar el premio ganador
  const [wonPrize, setWonPrize] = useState<any>(null)

  // --- CARGA INICIAL ---
  useEffect(() => {
    async function fetchInitialData() {
      setLoading(true)
      try {
        // 1. Buscar la campaña
        const { data: campData, error: campError } = await supabase
          .from('campaigns')
          .select('*')
          .eq('name', CAMPAIGN_NAME)
          .single()

        if (campError || !campData) throw new Error("Campaña no encontrada")
        setCampaign(campData)

        // 2. Buscar las tiendas activas de esta campaña
        const { data: storeData } = await supabase
          .from('stores')
          .select('*')
          .eq('campaign_id', campData.id)
          .eq('is_active', true)
          .order('name', { ascending: true })
        
        setStores(storeData || [])
      } catch (err: any) {
        console.error(err)
        setError('No se pudo cargar la información de la campaña.')
      } finally {
        setLoading(false)
      }
    }
    fetchInitialData()
  }, [CAMPAIGN_NAME])

  // --- COMPRESIÓN AGRESIVA WEBP ---
  const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.src = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 800; let w = img.width, h = img.height
        if (w > h && w > MAX) { h *= MAX / w; w = MAX } else if (h > MAX) { w *= MAX / h; h = MAX }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, w, h)
        canvas.toBlob(b => resolve(new File([b!], 'voucher.webp', { type: 'image/webp' })), 'image/webp', 0.6)
      }
    })
  }

  // --- LÓGICA DE ASIGNACIÓN DE PREMIO Y ENVÍO ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setWonPrize(null)

    if (!file || !formData.fullName) {
      setError('Por favor, completa tu nombre y sube la foto de tu voucher.')
      setSubmitting(false)
      return
    }

    try {
      // 1. Compresión y Subida del Voucher
      const optimized = await compressImage(file)
      const path = `${campaign.id}/${selectedStore.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.webp`
      
      const { error: uploadError } = await supabase.storage
        .from('vouchers')
        .upload(path, optimized)

      if (uploadError) throw new Error('Error al subir la imagen del voucher')
      
      const { data: urlData } = supabase.storage.from('vouchers').getPublicUrl(path)

      // 2. Lógica de Asignación de Premio por Lotes (Buckets)
      let assignedPrize = null;
      
      // Obtenemos todos los premios con stock mayor a 0 para esta tienda, ordenados por número de lote
      const { data: availablePrizes } = await supabase
        .from('prizes')
        .select('*')
        .eq('store_id', selectedStore.id)
        .gt('stock', 0)
        .order('batch_number', { ascending: true });

      if (availablePrizes && availablePrizes.length > 0) {
        // Encontramos cuál es el lote activo más bajo (ej. Si el lote 1 tiene stock, será 1. Si no, será 2)
        const lowestBatch = availablePrizes[0].batch_number;
        
        // Filtramos solo los premios que pertenecen a ese lote activo
        const prizesInBatch = availablePrizes.filter(p => p.batch_number === lowestBatch);
        
        // Seleccionamos un premio al azar de ese lote
        assignedPrize = prizesInBatch[Math.floor(Math.random() * prizesInBatch.length)];

        // Descontamos 1 de stock al premio seleccionado en la Base de Datos
        await supabase
          .from('prizes')
          .update({ stock: assignedPrize.stock - 1 })
          .eq('id', assignedPrize.id);
      }

      // 3. Registro en Base de Datos (con o sin premio asignado)
      const { error: insertError } = await supabase.from('registrations').insert({
        full_name: formData.fullName, 
        dni: 'N/A',   // Valor por defecto para no romper la BD que exige un DNI
        phone: 'N/A', // Valor por defecto 
        email: 'registro@frugos.pe',
        voucher_url: urlData.publicUrl, 
        campaign_id: campaign.id,
        store_id: selectedStore.id,
        prize_id: assignedPrize ? assignedPrize.id : null
      })

      if (insertError) throw insertError

      // Éxito: Guardamos el premio ganado en el estado y pasamos al paso 3
      if (assignedPrize) {
        setWonPrize(assignedPrize)
      }
      setStep(3)

    } catch (err: any) { 
      console.error(err)
      setError('Hubo un error al procesar tu registro. Inténtalo de nuevo.') 
    } finally { 
      setSubmitting(false) 
    }
  }

  // --- RENDERIZADO ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-green-600" size={48} />
        <p className="text-zinc-400 font-bold uppercase tracking-widest text-xs">Cargando experiencia...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      
      {/* Fondos Decorativos Suaves (Apple Style) */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-green-400/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-400/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/50 p-6 sm:p-10 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* HEADER COMÚN */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-green-500/30 mb-4 rotate-3">
             <span className="text-white font-black text-3xl italic leading-none">F</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter leading-none">
            Back to <span className="text-green-600">School</span>
          </h1>
          {step === 1 && <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mt-2">Selecciona tu sucursal para participar</p>}
          {step === 2 && <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mt-2">Sube tu voucher para jugar</p>}
        </div>

        {/* ALERTA GLOBAL */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-2xl flex items-center gap-3 animate-in shake duration-300">
            <AlertCircle size={18} className="shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* PASO 1: SELECCIÓN DE TIENDA */}
        {step === 1 && (
          <div className="space-y-3 animate-in slide-in-from-right-4 duration-300">
            {stores.length === 0 ? (
              <div className="text-center py-10 text-zinc-400">
                <Store size={40} className="mx-auto mb-3 opacity-20" />
                <p className="font-bold text-sm">No hay tiendas disponibles</p>
              </div>
            ) : (
              stores.map(store => (
                <button
                  key={store.id}
                  onClick={() => { setSelectedStore(store); setStep(2); setError(''); }}
                  className="w-full flex items-center justify-between bg-white p-5 rounded-[1.5rem] border border-zinc-100 hover:border-green-500 hover:shadow-lg hover:shadow-green-500/10 transition-all group active:scale-95"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-400 group-hover:bg-green-100 group-hover:text-green-600 transition-colors">
                      <Store size={18} />
                    </div>
                    <span className="font-black text-sm uppercase tracking-tight text-zinc-800">{store.name}</span>
                  </div>
                  <ChevronRight size={18} className="text-zinc-300 group-hover:text-green-500 transition-colors" />
                </button>
              ))
            )}
          </div>
        )}

        {/* PASO 2: FORMULARIO DE REGISTRO SIMPLIFICADO */}
        {step === 2 && selectedStore && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            
            <button 
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-800 transition-colors mb-2 bg-zinc-100 px-3 py-1.5 rounded-full w-fit"
            >
              <ArrowLeft size={12} /> Cambiar Tienda
            </button>

            <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center justify-between">
               <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Tienda Seleccionada:</span>
               <span className="text-xs font-black uppercase text-green-800">{selectedStore.name}</span>
            </div>

            {/* NOMBRES Y APELLIDOS */}
            <div className="space-y-2">
              <label className="text-[11px] font-black text-zinc-500 ml-2 uppercase tracking-widest">Nombres y Apellidos Completos</label>
              <input 
                type="text" required
                className="w-full px-6 py-5 rounded-[1.5rem] bg-white border border-zinc-200 outline-none text-zinc-800 font-bold text-base focus:ring-4 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm"
                placeholder="Ej. Juan Pérez"
                value={formData.fullName}
                onChange={e => setFormData({...formData, fullName: e.target.value})}
              />
            </div>

            {/* VOUCHER UPLOAD (Área Grande) */}
            <div className="space-y-2 pt-2">
              <label className="text-[11px] font-black text-zinc-500 ml-2 uppercase tracking-widest">Foto del Voucher</label>
              <label className={`flex flex-col items-center justify-center w-full h-40 rounded-[1.5rem] border-2 border-dashed cursor-pointer transition-all ${file ? 'border-green-500 bg-green-50 shadow-inner' : 'border-zinc-300 bg-white hover:bg-zinc-50'}`}>
                {file ? (
                  <div className="flex flex-col items-center text-green-600 gap-3 animate-in zoom-in duration-300">
                    <CheckCircle2 size={40} className="text-green-500 drop-shadow-md" />
                    <span className="text-sm font-black uppercase tracking-widest">Voucher Cargado</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-zinc-400 gap-3">
                    <div className="p-4 bg-zinc-50 rounded-full mb-1">
                      <Camera size={32} strokeWidth={1.5} className="text-zinc-500" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">Toca para tomar foto</span>
                  </div>
                )}
                <input 
                  type="file" className="hidden" accept="image/*" capture="environment" 
                  onChange={e => setFile(e.target.files?.[0] || null)} 
                />
              </label>
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-6">
              <button 
                type="submit" 
                disabled={submitting || !file || !formData.fullName}
                className="w-full py-5 bg-zinc-900 text-white rounded-[1.5rem] font-black text-lg uppercase tracking-widest hover:bg-black hover:shadow-2xl active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none flex justify-center items-center gap-3"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" size={24} /> Validando...
                  </>
                ) : (
                  <>
                    <Gift size={20} /> Revelar Premio
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* PASO 3: ÉXITO Y REVELACIÓN DEL PREMIO */}
        {step === 3 && (
          <div className="py-8 text-center flex flex-col items-center gap-6 animate-in zoom-in duration-700">
            
            {wonPrize ? (
              <>
                <div className="w-full relative py-6">
                   <div className="absolute inset-0 bg-green-500/20 rounded-full blur-[60px] animate-pulse"></div>
                   <div className="relative z-10 w-48 h-48 mx-auto bg-white rounded-full shadow-2xl border-4 border-green-400 overflow-hidden flex items-center justify-center p-4">
                      {wonPrize.image_url ? (
                        <img src={wonPrize.image_url} alt={wonPrize.name} className="w-full h-full object-contain animate-in zoom-in spin-in-12 duration-700" />
                      ) : (
                        <Gift size={80} className="text-green-500 animate-bounce" />
                      )}
                   </div>
                </div>
                
                <div className="space-y-3 px-4">
                  <h3 className="text-green-600 font-black uppercase tracking-widest text-xs">¡Felicidades {formData.fullName.split(' ')[0]}!</h3>
                  <h2 className="text-4xl font-black uppercase tracking-tighter text-zinc-900 leading-none">
                    Ganaste<br/><span className="text-green-600">{wonPrize.name}</span>
                  </h2>
                  <p className="text-xs font-bold text-zinc-500 bg-zinc-100 py-2 px-4 rounded-full inline-block mt-4">
                    Acércate al módulo para reclamarlo
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-24 h-24 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-400 mb-2">
                   <CheckCircle2 size={48} />
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black uppercase tracking-tighter text-zinc-900 leading-none">Registro Exitoso</h2>
                  <p className="text-sm font-bold text-zinc-500 px-4">Gracias por participar. Lamentablemente el stock de premios en esta tienda se ha agotado.</p>
                </div>
              </>
            )}

            <button 
              onClick={() => window.location.reload()}
              className="mt-8 px-10 py-5 bg-zinc-100 text-zinc-900 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-zinc-200 active:scale-95 transition-all w-full"
            >
              Registrar Otro Voucher
            </button>
          </div>
        )}

      </div>
    </div>
  )
}