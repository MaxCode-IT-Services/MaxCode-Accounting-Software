// src/utils/numberToWords.js
// Simple INR number to words utility (supports up to crores)

const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function numToWords(num, isInnerCall = false) {
  if (num === 0) return isInnerCall ? "" : "Zero Rupees Only";
  if (typeof num !== "number") num = Number(num);
  if (!Number.isFinite(num)) return "-";

  let str = "";
  if (num >= 10000000) {
    str += numToWords(Math.floor(num / 10000000), true) + " Crore ";
    num %= 10000000;
  }
  if (num >= 100000) {
    str += numToWords(Math.floor(num / 100000), true) + " Lakh ";
    num %= 100000;
  }
  if (num >= 1000) {
    str += numToWords(Math.floor(num / 1000), true) + " Thousand ";
    num %= 1000;
  }
  if (num >= 100) {
    str += numToWords(Math.floor(num / 100), true) + " Hundred ";
    num %= 100;
  }
  if (num > 0) {
    if (num < 20) str += ones[num] + " ";
    else {
      str += tens[Math.floor(num / 10)] + " ";
      if (num % 10 > 0) str += ones[num % 10] + " ";
    }
  }
  str = str.trim();
  return isInnerCall ? str : str ? str + " Rupees Only" : "Zero Rupees Only";
}

export default numToWords;
