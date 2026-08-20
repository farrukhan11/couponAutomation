const c = 'MILITARYDISCOUNTS';
const SUBSTR_BLOCK = /(interestedusers|current|expired|verified|verification|recorded|confirmation|checkout|interested|ago$|partnersince|trusted|vape|printing|printer|product|stores?|days$|shipping|codes?$)/i;
const START_WORD_BLOCK = /^(seeless|seemore|readmore|getdeal|getcode|showcode|viewcode|seecode|submitcoupon|navbar|activate|display|soon|storewide|limitedtime|flexible|financing|interestfree|timeless|premium|craftsmanship|flagsconnections|flags-connections|peak|motel|amazon|bissell|dhgate|athome|shopjura|dyson|ecoflow|pharmacy|sports|contact|viewall|periodic|popular|reviews|rule|heibk|scout|interest)/i;
console.log('SUBSTR match:', SUBSTR_BLOCK.exec(c));
console.log('START match:', START_WORD_BLOCK.exec(c));
console.log('MONTHDAY:', /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|july)\d{1,2}(st|nd|rd|th)$/i.test(c));
console.log('for:', /^for/i.test(c));
console.log('see:', /^see[a-z0-9]/i.test(c));