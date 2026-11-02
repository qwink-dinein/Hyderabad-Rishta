// GENERATED from src/domain/places.ts by scripts/sync-shared.js — do not edit here.
/**
 * Places for biodata and filters: every Indian state and union territory with ALL its districts
 * (770 districts, current as of November 2026, incl. the 33 districts of Telangana and 26 of Andhra Pradesh)
 * and main cities/towns, plus the countries most Hyderabadi families live in. Anything missing can always
 * be typed in ("Not in the list? Type it").
 * District list base: sab99r/Indian-States-And-Districts (MIT), updated for renames and new districts since 2019.
 */
export type Place = { districts: string[]; cities: string[] };

export const INDIA: Record<string, Place> = {
  "Andaman and Nicobar Islands": { districts: ["Nicobar", "North and Middle Andaman", "South Andaman"], cities: ["Nicobar"] },
  "Andhra Pradesh": { districts: ["Alluri Sitharama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Krishna", "Kurnool", "NTR", "Nandyal", "Palnadu", "Parvathipuram Manyam", "Prakasam", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR Kadapa"], cities: ["Visakhapatnam", "Vijayawada", "Guntur", "Nellore", "Kurnool", "Kakinada", "Rajamahendravaram", "Kadapa", "Tirupati", "Anantapur", "Eluru", "Ongole", "Vizianagaram", "Nandyal", "Machilipatnam", "Adoni", "Tenali", "Proddatur", "Chittoor", "Hindupur", "Bhimavaram", "Madanapalle", "Guntakal", "Dharmavaram", "Gudivada", "Srikakulam", "Narasaraopet", "Tadipatri", "Chilakaluripet", "Kavali", "Rayachoti", "Puttaparthi", "Amaravati", "Markapur", "Bapatla", "Palasa", "Tanuku", "Amalapuram", "Anakapalli", "Paderu", "Parvathipuram", "Nuzvid", "Srikalahasti", "Rajampet", "Yemmiganur", "Kadiri", "Pileru", "Punganur", "Alluri Sitharama Raju", "Annamayya", "Dr. B.R. Ambedkar Konaseema", "Krishna", "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "YSR Kadapa"] },
  "Arunachal Pradesh": { districts: ["Anjaw", "Changlang", "Dibang Valley", "East Kameng", "East Siang", "Kra Daadi", "Kurung Kumey", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Papum Pare", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri", "West Kameng", "West Siang"], cities: ["Anjaw", "Changlang", "Dibang Valley", "Kra Daadi", "Kurung Kumey", "Lohit", "Longding", "Lower Dibang Valley", "Lower Siang", "Lower Subansiri", "Namsai", "Papum Pare", "Siang", "Tawang", "Tirap", "Upper Siang", "Upper Subansiri"] },
  "Assam": { districts: ["Bajali", "Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tamulpur", "Tinsukia", "Udalguri", "West Karbi Anglong"], cities: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Dhubri", "Nagaon", "Barpeta", "Bajali", "Baksa", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nalbari", "Sivasagar", "Sonitpur", "Tamulpur", "Tinsukia", "Udalguri"] },
  "Bihar": { districts: ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"], cities: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Kishanganj", "Katihar", "Araria", "Siwan", "Arrah", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhojpur", "Buxar", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Khagaria", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Nalanda", "Nawada", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Supaul", "Vaishali"] },
  "Chandigarh": { districts: ["Chandigarh"], cities: ["Chandigarh"] },
  "Chhattisgarh": { districts: ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariyaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Khairagarh-Chhuikhadan-Gandai", "Kondagaon", "Korba", "Korea", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sakti", "Sarangarh-Bilaigarh", "Sukma", "Surajpur", "Surguja"], cities: ["Raipur", "Bhilai", "Bilaspur", "Durg", "Korba", "Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Dantewada", "Dhamtari", "Gariyaband", "Gaurela-Pendra-Marwahi", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Khairagarh-Chhuikhadan-Gandai", "Kondagaon", "Korea", "Mahasamund", "Manendragarh-Chirmiri-Bharatpur", "Mohla-Manpur-Ambagarh Chowki", "Mungeli", "Narayanpur", "Raigarh", "Rajnandgaon", "Sakti", "Sarangarh-Bilaigarh", "Sukma", "Surajpur", "Surguja"] },
  "Dadra and Nagar Haveli and Daman and Diu": { districts: ["Dadra and Nagar Haveli", "Daman", "Diu"], cities: ["Dadra and Nagar Haveli", "Daman", "Diu"] },
  "Delhi": { districts: ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi"], cities: ["New Delhi", "Delhi", "Shahdara"] },
  "Goa": { districts: ["North Goa", "South Goa"], cities: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"] },
  "Gujarat": { districts: ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udepur", "Dahod", "Dangs", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kachchh", "Kheda", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad"], cities: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Junagadh", "Bharuch", "Gandhinagar", "Godhra", "Anand", "Amreli", "Aravalli", "Banaskantha", "Botad", "Chhota Udepur", "Dahod", "Dangs", "Devbhoomi Dwarka", "Gir Somnath", "Kachchh", "Kheda", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Sabarkantha", "Surendranagar", "Tapi", "Valsad"] },
  "Haryana": { districts: ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar"], cities: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Nuh", "Hisar", "Rohtak", "Bhiwani", "Charkhi Dadri", "Fatehabad", "Jhajjar", "Jind", "Kaithal", "Kurukshetra", "Mahendragarh", "Palwal", "Panchkula", "Rewari", "Sirsa", "Sonipat", "Yamunanagar"] },
  "Himachal Pradesh": { districts: ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul &amp; Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"], cities: ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul &amp; Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una"] },
  "Jammu and Kashmir": { districts: ["Anantnag", "Bandipore", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur"], cities: ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Sopore", "Pulwama", "Bandipore", "Budgam", "Doda", "Ganderbal", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Udhampur"] },
  "Jharkhand": { districts: ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribag", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahibganj", "Seraikela-Kharsawan", "Simdega", "West Singhbhum"], cities: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribag", "Deoghar", "Chatra", "Dumka", "Garhwa", "Giridih", "Godda", "Gumla", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Sahibganj", "Seraikela-Kharsawan", "Simdega"] },
  "Karnataka": { districts: ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davanagere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayanagara", "Vijayapura", "Yadgir"], cities: ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Dharwad", "Belagavi", "Kalaburagi", "Bidar", "Vijayapura", "Ballari", "Raichur", "Davanagere", "Shivamogga", "Tumakuru", "Udupi", "Bhatkal", "Hassan", "Mandya", "Chitradurga", "Kolar", "Chikkaballapur", "Hosapete", "Gadag", "Bagalkot", "Koppal", "Yadgir", "Karwar", "Madikeri", "Chikkamagaluru", "Ramanagara", "Basavakalyan", "Humnabad", "Chamarajanagar", "Haveri", "Kodagu", "Vijayanagara"] },
  "Kerala": { districts: ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad"], cities: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Malappuram", "Thrissur", "Kannur", "Kasaragod", "Kollam", "Palakkad", "Alappuzha", "Kottayam", "Ernakulam", "Idukki", "Pathanamthitta", "Wayanad"] },
  "Ladakh": { districts: ["Kargil", "Leh"], cities: ["Leh", "Kargil"] },
  "Lakshadweep": { districts: ["Agatti", "Amini", "Androth", "Bithra", "Chethlath", "Kadmath", "Kalpeni", "Kavaratti", "Kilthan", "Minicoy"], cities: ["Agatti", "Amini", "Androth", "Bithra", "Chethlath", "Kadmath", "Kalpeni", "Kavaratti", "Kilthan", "Minicoy"] },
  "Madhya Pradesh": { districts: ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Maihar", "Mandla", "Mandsaur", "Mauganj", "Morena", "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha"], cities: ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Burhanpur", "Ratlam", "Sagar", "Dewas", "Khandwa", "Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dhar", "Dindori", "Guna", "Harda", "Jhabua", "Katni", "Khargone", "Maihar", "Mandla", "Mandsaur", "Mauganj", "Morena", "Narmadapuram", "Narsinghpur", "Neemuch", "Niwari", "Pandhurna", "Panna", "Raisen", "Rajgarh", "Rewa", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Umaria", "Vidisha"] },
  "Maharashtra": { districts: ["Ahilyanagar", "Akola", "Amravati", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Chhatrapati Sambhajinagar", "Dharashiv", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal"], cities: ["Mumbai", "Pune", "Nagpur", "Nashik", "Thane", "Navi Mumbai", "Chhatrapati Sambhajinagar", "Aurangabad", "Solapur", "Nanded", "Malegaon", "Bhiwandi", "Mumbra", "Kalyan", "Vasai-Virar", "Panvel", "Kolhapur", "Amravati", "Akola", "Latur", "Parbhani", "Jalna", "Beed", "Dharashiv", "Ahilyanagar", "Jalgaon", "Dhule", "Sangli", "Satara", "Ratnagiri", "Udgir", "Hingoli", "Washim", "Yavatmal", "Chandrapur", "Bhandara", "Buldhana", "Gadchiroli", "Gondia", "Nandurbar", "Palghar", "Raigad", "Sindhudurg", "Wardha"] },
  "Manipur": { districts: ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"], cities: ["Bishnupur", "Chandel", "Churachandpur", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul"] },
  "Meghalaya": { districts: ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills"], cities: ["Ri Bhoi"] },
  "Mizoram": { districts: ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip"], cities: ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip"] },
  "Nagaland": { districts: ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto"], cities: ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto"] },
  "Odisha": { districts: ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghapur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh"], cities: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Balasore", "Angul", "Balangir", "Bargarh", "Bhadrak", "Boudh", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghapur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Subarnapur", "Sundargarh"] },
  "Puducherry": { districts: ["Karaikal", "Mahe", "Puducherry", "Yanam"], cities: ["Puducherry", "Karaikal", "Mahe", "Yanam"] },
  "Punjab": { districts: ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Malerkotla", "Mansa", "Moga", "Mohali", "Pathankot", "Patiala", "Rupnagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Sri Muktsar Sahib", "Tarn Taran"], cities: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Mohali", "Malerkotla", "Bathinda", "Barnala", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Kapurthala", "Mansa", "Moga", "Pathankot", "Rupnagar", "Sangrur", "Shahid Bhagat Singh Nagar", "Sri Muktsar Sahib", "Tarn Taran"] },
  "Rajasthan": { districts: ["Ajmer", "Alwar", "Balotra", "Banswara", "Baran", "Barmer", "Beawar", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg", "Dholpur", "Didwana-Kuchaman", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Khairthal-Tijara", "Kota", "Kotputli-Behror", "Nagaur", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Salumbar", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur"], cities: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner", "Alwar", "Tonk", "Bhilwara", "Sikar", "Balotra", "Banswara", "Baran", "Barmer", "Beawar", "Bharatpur", "Bundi", "Chittorgarh", "Churu", "Dausa", "Deeg", "Dholpur", "Didwana-Kuchaman", "Dungarpur", "Hanumangarh", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Karauli", "Khairthal-Tijara", "Kotputli-Behror", "Nagaur", "Pali", "Phalodi", "Pratapgarh", "Rajsamand", "Salumbar", "Sawai Madhopur", "Sirohi", "Sri Ganganagar"] },
  "Sikkim": { districts: ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"], cities: [] },
  "Tamil Nadu": { districts: ["Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar"], cities: ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Vellore", "Erode", "Tiruppur", "Thoothukudi", "Ambur", "Vaniyambadi", "Krishnagiri", "Kanchipuram", "Nagapattinam", "Kumbakonam", "Hosur", "Ariyalur", "Chengalpattu", "Cuddalore", "Dharmapuri", "Dindigul", "Kallakurichi", "Kanyakumari", "Karur", "Mayiladuthurai", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Ranipet", "Sivaganga", "Tenkasi", "Thanjavur", "Theni", "Tirupathur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Viluppuram", "Virudhunagar"] },
  "Telangana": { districts: ["Adilabad", "Bhadradri Kothagudem", "Hanumakonda", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Kumuram Bheem Asifabad", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal–Malkajgiri", "Mulugu", "Nagarkurnool", "Nalgonda", "Narayanpet", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal", "Yadadri Bhuvanagiri"], cities: ["Hyderabad", "Secunderabad", "Warangal", "Hanumakonda", "Karimnagar", "Nizamabad", "Khammam", "Ramagundam", "Mahabubnagar", "Nalgonda", "Adilabad", "Suryapet", "Miryalaguda", "Siddipet", "Jagtial", "Mancherial", "Kamareddy", "Bodhan", "Sangareddy", "Zaheerabad", "Nirmal", "Kothagudem", "Palvancha", "Bhongir", "Vikarabad", "Tandur", "Wanaparthy", "Gadwal", "Narayanpet", "Nagarkurnool", "Jangaon", "Medak", "Sircilla", "Peddapalli", "Mahabubabad", "Bhupalpally", "Mulugu", "Asifabad", "Kagaznagar", "Bellampalli", "Mandamarri", "Armoor", "Korutla", "Metpally", "Kodad", "Huzurnagar", "Bhadrachalam", "Sathupalli", "Yellandu", "Shadnagar", "Shamshabad", "Medchal", "Gajwel", "Narsapur", "Banswada", "Devarakonda", "Huzurabad", "Jammikunta", "Manthani", "Kalwakurthy", "Achampet", "Jadcherla", "Ibrahimpatnam", "Choutuppal", "Sadasivpet", "Patancheru", "Bhadradri Kothagudem", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kumuram Bheem Asifabad", "Medchal–Malkajgiri", "Rajanna Sircilla", "Rangareddy", "Yadadri Bhuvanagiri"] },
  "Tripura": { districts: ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura"], cities: ["Dhalai", "Gomati", "Khowai", "Sepahijala", "Unakoti"] },
  "Uttar Pradesh": { districts: ["Agra", "Aligarh", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Ayodhya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kushinagar", "Lakhimpur Kheri", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Prayagraj", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharth Nagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi"], cities: ["Lucknow", "Kanpur", "Agra", "Varanasi", "Prayagraj", "Aligarh", "Meerut", "Bareilly", "Moradabad", "Saharanpur", "Rampur", "Ghaziabad", "Noida", "Gorakhpur", "Azamgarh", "Muzaffarnagar", "Deoband", "Sambhal", "Amroha", "Ayodhya", "Ambedkar Nagar", "Amethi", "Auraiya", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghazipur", "Gonda", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kushinagar", "Lakhimpur Kheri", "Lalitpur", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Mirzapur", "Pilibhit", "Pratapgarh", "Raebareli", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharth Nagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao"] },
  "Uttarakhand": { districts: ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"], cities: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rudrapur", "Almora", "Bageshwar", "Chamoli", "Champawat", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi"] },
  "West Bengal": { districts: ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur"], cities: ["Kolkata", "Howrah", "Asansol", "Durgapur", "Siliguri", "Murshidabad", "Malda", "Bardhaman", "Kharagpur", "Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Darjeeling", "Hooghly", "Jalpaiguri", "Jhargram", "Kalimpong", "Nadia", "Purulia"] },
};

export const ABROAD: Record<string, Record<string, Place>> = {
  "United Arab Emirates": {
    "Dubai": { districts: [], cities: ["Dubai"] },
    "Abu Dhabi": { districts: [], cities: ["Abu Dhabi", "Al Ain"] },
    "Sharjah": { districts: [], cities: ["Sharjah"] },
    "Ajman": { districts: [], cities: ["Ajman"] },
    "Ras Al Khaimah": { districts: [], cities: ["Ras Al Khaimah"] },
    "Fujairah": { districts: [], cities: ["Fujairah"] },
    "Umm Al Quwain": { districts: [], cities: ["Umm Al Quwain"] },
  },
  "Saudi Arabia": {
    "Riyadh": { districts: [], cities: ["Riyadh"] },
    "Makkah": { districts: [], cities: ["Jeddah", "Makkah", "Taif"] },
    "Madinah": { districts: [], cities: ["Madinah", "Yanbu"] },
    "Eastern Province": { districts: [], cities: ["Dammam", "Al Khobar", "Dhahran", "Jubail", "Al Ahsa"] },
    "Qassim": { districts: [], cities: ["Buraidah"] },
    "Asir": { districts: [], cities: ["Abha", "Khamis Mushait"] },
    "Tabuk": { districts: [], cities: ["Tabuk"] },
  },
  "Qatar": {
    "Doha": { districts: [], cities: ["Doha"] },
    "Al Rayyan": { districts: [], cities: ["Al Rayyan"] },
    "Al Wakrah": { districts: [], cities: ["Al Wakrah"] },
  },
  "Kuwait": {
    "Al Asimah": { districts: [], cities: ["Kuwait City"] },
    "Hawalli": { districts: [], cities: ["Hawalli", "Salmiya"] },
    "Farwaniya": { districts: [], cities: ["Farwaniya"] },
    "Ahmadi": { districts: [], cities: ["Fahaheel", "Mangaf"] },
  },
  "Oman": {
    "Muscat": { districts: [], cities: ["Muscat", "Ruwi", "Seeb"] },
    "Dhofar": { districts: [], cities: ["Salalah"] },
    "North Al Batinah": { districts: [], cities: ["Sohar"] },
  },
  "Bahrain": {
    "Capital": { districts: [], cities: ["Manama"] },
    "Muharraq": { districts: [], cities: ["Muharraq"] },
    "Southern": { districts: [], cities: ["Riffa", "Isa Town"] },
  },
  "United States": {
    "Texas": { districts: [], cities: ["Dallas", "Houston", "Austin", "Irving", "Plano", "Frisco", "San Antonio"] },
    "California": { districts: [], cities: ["San Jose", "Los Angeles", "San Francisco", "Fremont", "Sunnyvale", "San Diego", "Irvine"] },
    "New Jersey": { districts: [], cities: ["Jersey City", "Edison", "Iselin", "Princeton"] },
    "Illinois": { districts: [], cities: ["Chicago", "Naperville", "Schaumburg"] },
    "New York": { districts: [], cities: ["New York City", "Buffalo", "Albany"] },
    "Virginia": { districts: [], cities: ["Ashburn", "Herndon", "Richmond"] },
    "Washington": { districts: [], cities: ["Seattle", "Redmond", "Bellevue"] },
    "Georgia": { districts: [], cities: ["Atlanta", "Alpharetta"] },
    "Michigan": { districts: [], cities: ["Detroit", "Dearborn", "Troy"] },
    "Florida": { districts: [], cities: ["Miami", "Tampa", "Orlando", "Jacksonville"] },
    "North Carolina": { districts: [], cities: ["Charlotte", "Raleigh"] },
    "Massachusetts": { districts: [], cities: ["Boston"] },
    "Pennsylvania": { districts: [], cities: ["Philadelphia", "Pittsburgh"] },
    "Arizona": { districts: [], cities: ["Phoenix"] },
    "Ohio": { districts: [], cities: ["Columbus", "Cincinnati"] },
    "Minnesota": { districts: [], cities: ["Minneapolis"] },
  },
  "United Kingdom": {
    "England": { districts: [], cities: ["London", "Birmingham", "Manchester", "Leicester", "Bradford", "Leeds", "Luton", "Slough", "Reading", "Coventry"] },
    "Scotland": { districts: [], cities: ["Glasgow", "Edinburgh"] },
    "Wales": { districts: [], cities: ["Cardiff"] },
  },
  "Canada": {
    "Ontario": { districts: [], cities: ["Toronto", "Mississauga", "Brampton", "Ottawa", "Markham"] },
    "Alberta": { districts: [], cities: ["Calgary", "Edmonton"] },
    "British Columbia": { districts: [], cities: ["Vancouver", "Surrey"] },
    "Quebec": { districts: [], cities: ["Montreal"] },
  },
  "Australia": {
    "New South Wales": { districts: [], cities: ["Sydney"] },
    "Victoria": { districts: [], cities: ["Melbourne"] },
    "Queensland": { districts: [], cities: ["Brisbane"] },
    "Western Australia": { districts: [], cities: ["Perth"] },
    "South Australia": { districts: [], cities: ["Adelaide"] },
  },
  "New Zealand": {
    "Auckland": { districts: [], cities: ["Auckland"] },
    "Wellington": { districts: [], cities: ["Wellington"] },
  },
  "Singapore": {
    "Singapore": { districts: [], cities: ["Singapore"] },
  },
  "Malaysia": {
    "Kuala Lumpur": { districts: [], cities: ["Kuala Lumpur"] },
    "Selangor": { districts: [], cities: ["Petaling Jaya", "Shah Alam"] },
    "Penang": { districts: [], cities: ["George Town"] },
  },
  "Germany": {
    "Bavaria": { districts: [], cities: ["Munich"] },
    "Hesse": { districts: [], cities: ["Frankfurt"] },
    "Berlin": { districts: [], cities: ["Berlin"] },
    "Baden-W\u00fcrttemberg": { districts: [], cities: ["Stuttgart"] },
  },
  "Ireland": {
    "Leinster": { districts: [], cities: ["Dublin"] },
  },
};
