'use client';

import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertTriangle, XCircle, Loader2, RefreshCw, BookOpen } from 'lucide-react';

export default function CitationCard() {
  const [author, setAuthor] = useState('');
  const [quote, setQuote] = useState('');
  const [page, setPage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (!file || !author || !quote) {
      alert('الرجاء رفع ملف المرجع (PDF)، وإدخال اسم العالم ونص الاقتباس.');
      return;
    }

    setIsLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('author', author);
    formData.append('quote', quote);
    formData.append('page', page);

    try {
      const response = await fetch('/api/verify-engine', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ status: 'error', message: 'فشل الاتصال بمحرك التحقق الهجين.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-gray-100 rounded-2xl p-6 bg-white shadow-xl max-w-3xl mx-auto" dir="rtl">
      {/* Header */}
      <h3 className="font-bold text-2xl text-slate-800 mb-6 flex items-center gap-3 border-b pb-4">
        <BookOpen className="w-7 h-7 text-indigo-600"/>
        نظام التحقق الهجين (دقة 100%)
      </h3>

      {/* Input Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-bold text-gray-600 mb-2">اسم العالم / المؤلف:</label>
          <input
            type="text"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            placeholder="مثال: أحمد شوقي أو Smith"
            className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-600 mb-2">رقم الصفحة المتوقع (اختياري):</label>
          <input
            type="text"
            value={page}
            onChange={e => setPage(e.target.value)}
            placeholder="مثال: 45"
            className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-bold text-gray-600 mb-2">النص المقتبس (الذي تريد تدقيقه):</label>
        <textarea
          value={quote}
          onChange={e => setQuote(e.target.value)}
          rows={3}
          placeholder="اكتب الاقتباس الحرفي أو الفكرة هنا..."
          className="w-full p-3 border border-gray-200 rounded-xl text-sm italic focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* File Upload Section */}
      <div className="mb-6 p-5 border-2 border-dashed border-indigo-100 rounded-xl bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-sm font-bold text-gray-700">الكتاب المصدر (PDF)</span>
          <span className="text-xs text-gray-500">للبحث واستخراج رقم الصفحة الحقيقي من الهوامش</span>
        </div>
        <div className="flex items-center gap-3">
          <input type="file" ref={fileInputRef} onChange={e => setFile(e.target.files?.[0] || null)} accept=".pdf" className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-white hover:bg-gray-50 text-indigo-700 font-bold text-sm py-2.5 px-5 rounded-xl border border-indigo-200 shadow-sm transition-all flex items-center gap-2"
          >
            <Upload className="w-4 h-4"/> ارفع المرجع
          </button>
        </div>
      </div>
      {file && <div className="mb-5 text-sm text-emerald-600 font-bold bg-emerald-50 p-2 rounded-lg text-center">✓ تم إرفاق الملف: {file.name}</div>}

      {/* Submit Button */}
      <button
        onClick={handleProcess}
        disabled={isLoading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-lg"
      >
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin"/> : <CheckCircle className="w-6 h-6"/>}
        {isLoading ? 'يتم الآن فحص الملف والمكتبات العالمية...' : 'ابدأ التدقيق والتحقق الشامل'}
      </button>

      {/* Results Display */}
      {result && (
        <div className={`mt-6 p-5 rounded-2xl border ${
          result.status === 'VERIFIED_EXACT' ? 'bg-emerald-50 border-emerald-200' :
          result.status === 'VERIFIED_CORRECTED' ? 'bg-amber-50 border-amber-200' :
          result.status === 'ALTERNATIVE_FOUND' ? 'bg-blue-50 border-blue-200' :
          'bg-rose-50 border-rose-200'
        }`}>
          <div className="flex items-center gap-3 font-bold text-lg mb-3">
            {result.status === 'VERIFIED_EXACT' && <CheckCircle className="w-6 h-6 text-emerald-600"/>}
            {result.status === 'VERIFIED_CORRECTED' && <AlertTriangle className="w-6 h-6 text-amber-600"/>}
            {result.status === 'ALTERNATIVE_FOUND' && <RefreshCw className="w-6 h-6 text-blue-600"/>}
            {(result.status === 'NOT_FOUND' || result.status === 'error') && <XCircle className="w-6 h-6 text-rose-600"/>}
            <span className={
              result.status === 'VERIFIED_EXACT' ? 'text-emerald-800' :
              result.status === 'VERIFIED_CORRECTED' ? 'text-amber-800' :
              result.status === 'ALTERNATIVE_FOUND' ? 'text-blue-800' :
              'text-rose-800'
            }>{result.message}</span>
          </div>

          {/* Correct Page Info (from File) */}
          {result.page && (result.status === 'VERIFIED_EXACT' || result.status === 'VERIFIED_CORRECTED') && (
            <div className="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm mt-3">
              <span className="font-medium text-gray-600">رقم الصفحة الحقيقي والمطابق:</span>
              <span className="font-bold text-xl bg-emerald-100 border border-emerald-200 text-emerald-800 px-4 py-1.5 rounded-lg">صـ {result.page}</span>
            </div>
          )}

          {/* Alternative Suggestion (from Global Library) */}
          {result.status === 'ALTERNATIVE_FOUND' && result.alternative && (
            <div className="mt-4 bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
              <span className="text-sm font-bold text-blue-700 uppercase block mb-3 border-b border-blue-50 pb-2">
                ✓ التوثيق المعتمد عالمياً (صحيح 100%):
              </span>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-700 mb-4">
                <p><strong>العنوان المعتمد:</strong> {result.alternative.title}</p>
                <p><strong>المؤلف الرسمي:</strong> {result.alternative.author}</p>
                <p><strong>سنة النشر:</strong> {result.alternative.year}</p>
                <p><strong>رقم الصفحة المستخرج:</strong> <span className="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded">صـ {result.page}</span></p>
              </div>
              <div>
                <span className="text-xs font-bold text-gray-500 block mb-2">التوثيق الجاهز للنسخ (APA):</span>
                <div className="bg-slate-50 p-3 rounded-lg text-sm font-mono text-slate-800 select-all border border-slate-200" dir="ltr">
                  {result.alternative.fullApa}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
