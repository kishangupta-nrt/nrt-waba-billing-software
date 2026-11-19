'use client';

import React from 'react';
import { Invoice, CompanySettings } from '@/lib/types';
import { defaultCompanySettings } from '@/lib/mockData';

interface InvoiceTemplateProps {
  invoice: Invoice;
  companySettings?: CompanySettings;
  className?: string;
  id?: string;
}

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  invoice,
  companySettings = defaultCompanySettings,
  className = '',
  id = 'invoice-print-container',
}) => {
  const isCgst = invoice.tax_mode === 'CGST_SGST';
  const totalQtyStr = `${(Number(invoice.total_quantity) || 0).toFixed(4)} NOS`;
  const totalAmtStr = `₹ ${(Number(invoice.total_amount) || 0).toFixed(4)}`;

  return (
    <div
      id={id}
      className={`bg-white text-black font-sans leading-tight text-[11px] max-w-[800px] mx-auto border border-black shadow-sm print:shadow-none print:border-black print:max-w-none print:w-full print:m-0 print:p-0 ${className}`}
      style={{ boxSizing: 'border-box', fontFamily: 'Arial, Helvetica, sans-serif' }}
    >
      {/* Title */}
      <div className="text-center font-bold text-[15px] pt-2 pb-1 tracking-wide border-b border-black">
        {invoice.invoice_type || 'Proforma Invoice'}
      </div>

      {/* Top Grid: Left = Company & Buyer, Right = Voucher & Reference Details */}
      <div className="grid grid-cols-2 border-b border-black">
        {/* Left Column */}
        <div className="border-r border-black flex flex-col justify-between">
          {/* Company Details */}
          <div className="p-2 border-b border-black flex items-start gap-2 min-h-[110px]">
            {/* Logo */}
            <div className="w-[100px] flex-shrink-0 pt-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full object-contain max-h-[70px]"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            {/* Address */}
            <div className="flex-1 text-[10px] leading-[1.3]">
              <div className="font-bold text-[11px] text-black">
                {companySettings.company_name}
              </div>
              <div className="text-gray-800">
                {companySettings.address_line1}
              </div>
              <div className="text-gray-800">
                {companySettings.address_line2}
              </div>
              <div className="text-gray-800">
                {companySettings.city_state_pin}
              </div>
              <div className="font-semibold text-black mt-0.5">
                GSTIN/UIN: {companySettings.gstin}
              </div>
              <div className="text-gray-900">
                State Name : {companySettings.state_name}, Code : {companySettings.state_code}
              </div>
            </div>
          </div>

          {/* Buyer Details */}
          <div className="p-2 min-h-[90px] flex flex-col justify-between">
            <div>
              <div className="text-[10px] text-gray-700">Buyer (Bill to)</div>
              <div className="font-bold text-[12px] text-black tracking-wide mt-0.5">
                {invoice.buyer_name}
              </div>
              {invoice.buyer_address && (
                <div className="text-[10px] text-gray-800 whitespace-pre-line">
                  {invoice.buyer_address}
                </div>
              )}
              {invoice.buyer_gstin && (
                <div className="text-[10px] font-semibold text-gray-900 mt-0.5">
                  GSTIN/UIN: {invoice.buyer_gstin}
                </div>
              )}
            </div>
            <div className="text-[10px] font-medium text-black mt-1">
              State Name &nbsp;: {invoice.buyer_state_name}, Code : {invoice.buyer_state_code}
            </div>
          </div>
        </div>

        {/* Right Column: Key-Value Table */}
        <div className="flex flex-col text-[10px]">
          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black min-h-[36px]">
              <div className="text-gray-600 text-[9px]">Voucher No.</div>
              <div className="font-bold text-black text-[11px]">{invoice.voucher_no}</div>
            </div>
            <div className="p-1.5 min-h-[36px]">
              <div className="text-gray-600 text-[9px]">Dated</div>
              <div className="font-bold text-black text-[11px]">{invoice.formatted_date || invoice.invoice_date}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black min-h-[36px]">
              <div className="text-gray-600 text-[9px]">Buyer&apos;s Ref./Order No.</div>
              <div className="font-bold text-black text-[10px]">{invoice.buyer_order_no || invoice.voucher_no}</div>
            </div>
            <div className="p-1.5 min-h-[36px]">
              <div className="text-gray-600 text-[9px]">Mode/Terms of Payment</div>
              <div className="font-medium text-black">{invoice.mode_terms_of_payment || ''}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-black">
            <div className="p-1.5 border-r border-black min-h-[34px]">
              <div className="text-gray-600 text-[9px]">Dispatched through</div>
              <div className="font-medium text-black">{invoice.dispatched_through || ''}</div>
            </div>
            <div className="p-1.5 min-h-[34px]">
              <div className="text-gray-600 text-[9px]">Other References</div>
              <div className="font-bold text-black text-[10.5px]">{invoice.other_references || ''}</div>
            </div>
          </div>

          <div className="p-1.5 border-b border-black min-h-[28px]">
            <div className="text-gray-600 text-[9px]">Destination</div>
            <div className="font-medium text-black">{invoice.destination || ''}</div>
          </div>

          <div className="p-1.5 min-h-[32px] flex-1">
            <div className="text-gray-600 text-[9px]">Terms of Delivery</div>
            <div className="text-gray-800 text-[9.5px]">{invoice.terms_of_delivery || ''}</div>
          </div>
        </div>
      </div>

      {/* Services Table */}
      <div className="w-full">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-b border-black text-center font-semibold text-gray-900">
              <th className="border-r border-black p-1 w-[5%]">Sl<br />No.</th>
              <th className="border-r border-black p-1 w-[41%]">Description of<br />Services</th>
              <th className="border-r border-black p-1 w-[10%]">HSN/SAC</th>
              <th className="border-r border-black p-1 w-[10%]">Due on</th>
              <th className="border-r border-black p-1 w-[13%]">Quantity</th>
              <th className="border-r border-black p-1 w-[7%]">Rate</th>
              <th className="border-r border-black p-1 w-[5%]">per</th>
              <th className="p-1 w-[12%] text-right pr-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {/* Primary Line Items */}
            {invoice.items.map((item, index) => (
              <tr key={item.id || index} className="align-top">
                <td className="border-r border-black text-center p-1 font-bold">
                  {item.sl_no || index + 1}
                </td>
                <td className="border-r border-black p-1">
                  <div className="font-bold text-[11px] text-black">
                    {item.service_title}
                  </div>
                  {item.service_description && (
                    <div className="italic text-gray-800 text-[9.5px] pl-2 mt-0.5">
                      {item.service_description}
                    </div>
                  )}
                </td>
                <td className="border-r border-black text-center p-1 font-medium">
                  {item.hsn_sac}
                </td>
                <td className="border-r border-black text-center p-1 font-medium whitespace-nowrap">
                  {item.due_on || invoice.formatted_date || invoice.invoice_date}
                </td>
                <td className="border-r border-black text-right p-1 pr-1.5 font-bold whitespace-nowrap">
                  {(Number(item.quantity) || 0).toFixed(4)} {item.per || 'NOS'}
                </td>
                <td className="border-r border-black text-right p-1 pr-1 font-medium">
                  {(Number(item.rate) || 0).toFixed(4)}
                </td>
                <td className="border-r border-black text-center p-1 font-medium">
                  {item.per || 'NOS'}
                </td>
                <td className="text-right p-1 pr-2 font-bold whitespace-nowrap">
                  {(Number(item.amount) || 0).toFixed(4)}
                </td>
              </tr>
            ))}

            {/* Spacer row to create vertical room matching sample */}
            <tr className="h-44">
              <td className="border-r border-black"></td>
              <td className="border-r border-black p-2 flex flex-col justify-end text-right">
                {isCgst ? (
                  <>
                    <div className="font-bold italic text-black pr-2">Output CGST @9%</div>
                    <div className="font-bold italic text-black pr-2 mt-1">Output SGST @9%</div>
                  </>
                ) : (
                  <div className="font-bold italic text-black pr-2">Output IGST @18%</div>
                )}
                <div className="font-bold italic text-black pr-2 mt-1">Round Off</div>
              </td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black p-2 flex flex-col justify-end text-right pr-1">
                {isCgst ? (
                  <>
                    <div className="font-bold text-black">{invoice.cgst_rate || 9} %</div>
                    <div className="font-bold text-black mt-1">{invoice.sgst_rate || 9} %</div>
                  </>
                ) : (
                  <div className="font-bold text-black">{invoice.igst_rate || 18} %</div>
                )}
                <div className="mt-1 invisible">0%</div>
              </td>
              <td className="border-r border-black"></td>
              <td className="p-2 flex flex-col justify-end text-right pr-2">
                {isCgst ? (
                  <>
                    <div className="font-bold text-black">
                      {(Number(invoice.cgst_amount) || 0).toFixed(4)}
                    </div>
                    <div className="font-bold text-black mt-1">
                      {(Number(invoice.sgst_amount) || 0).toFixed(4)}
                    </div>
                  </>
                ) : (
                  <div className="font-bold text-black">
                    {(Number(invoice.igst_amount) || 0).toFixed(4)}
                  </div>
                )}
                <div className="font-bold text-black mt-1">
                  {(Number(invoice.round_off) || 0).toFixed(4)}
                </div>
              </td>
            </tr>

            {/* Total Row */}
            <tr className="border-t border-b border-black font-bold">
              <td className="border-r border-black"></td>
              <td className="border-r border-black text-right p-1 pr-2">
                Total
              </td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black text-right p-1 pr-1.5 whitespace-nowrap">
                {totalQtyStr}
              </td>
              <td className="border-r border-black"></td>
              <td className="border-r border-black"></td>
              <td className="text-right p-1 pr-2 text-[11px] whitespace-nowrap">
                {totalAmtStr}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount Chargeable In Words & E.& O.E */}
      <div className="border-b border-black p-2 flex justify-between items-start text-[10px]">
        <div>
          <div className="text-gray-600 text-[9px]">Amount Chargeable (in words)</div>
          <div className="font-bold text-black text-[11px] mt-0.5">
            {invoice.amount_in_words || 'INR Zero Only'}
          </div>
        </div>
        <div className="font-semibold text-black text-[10px]">
          E. & O.E
        </div>
      </div>

      {/* Bottom Section: Bank Details & Signatory */}
      <div className="grid grid-cols-2 text-[10px]">
        {/* Left Footer: PAN & Declaration */}
        <div className="border-r border-black p-2 flex flex-col justify-between">
          <div className="font-bold text-black mb-2">
            Company&apos;s PAN : <span className="font-extrabold">{companySettings.pan}</span>
          </div>

          <div className="text-[9px] text-gray-800 leading-normal border-t border-gray-200 pt-1">
            <div className="font-bold text-black underline mb-0.5">Declaration</div>
            We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
          </div>
        </div>

        {/* Right Footer: Bank Details & Authorised Signatory */}
        <div className="p-2 flex flex-col justify-between">
          <div className="leading-snug text-[9.5px]">
            <div className="font-bold underline text-black mb-1">Company&apos;s Bank Details</div>
            <div className="grid grid-cols-[110px_1fr] gap-x-1">
              <span className="text-gray-700">A/c Holder&apos;s Name</span>
              <span className="font-bold text-black">: {companySettings.bank_holder_name}</span>

              <span className="text-gray-700">Bank Name</span>
              <span className="font-bold text-black">: {companySettings.bank_name}</span>

              <span className="text-gray-700">A/c No.</span>
              <span className="font-bold text-black">: {companySettings.account_no}</span>

              <span className="text-gray-700">Branch & IFS Code</span>
              <span className="font-bold text-black">: {companySettings.branch_ifsc}</span>

              <span className="text-gray-700">SWIFT Code</span>
              <span className="font-bold text-black">: {companySettings.swift_code}</span>
            </div>
          </div>

          <div className="text-right mt-4 pt-1">
            <div className="text-[10px] text-black">
              for <span className="font-bold">{companySettings.company_name}</span>
            </div>
            <div className="h-10"></div>
            <div className="font-bold text-black text-[10px]">
              Authorised Signatory
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Sub-text */}
      <div className="text-center text-[8.5px] text-gray-700 py-1 border-t border-black bg-gray-50 print:bg-transparent">
        This is a Computer Generated Document
      </div>
    </div>
  );
};
