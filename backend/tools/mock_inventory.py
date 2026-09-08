"""City-aware mock hotels & restaurants for major Indian metros.

Demo inventory only — not live Places data. Each city has local areas/names
so Bangalore never returns Connaught Place, etc.
"""

from __future__ import annotations

from typing import Any, Optional

# Canonical city → default area when user does not name one
DEFAULT_AREA_BY_CITY: dict[str, str] = {
    "Delhi": "Connaught Place",
    "Mumbai": "Bandra",
    "Bangalore": "Koramangala",
    "Hyderabad": "Hitech City",
    "Chennai": "T Nagar",
    "Pune": "Koregaon Park",
    "Kolkata": "Park Street",
    "Goa": "Panaji",
    "Jaipur": "C Scheme",
}

# Flat area list for utterance parsing (longer phrases first via sorted match)
CITY_AREAS: dict[str, list[str]] = {
    "Delhi": [
        "connaught place",
        "karol bagh",
        "hauz khas",
        "saket",
        "lajpat nagar",
        "aerocity",
        "india gate",
        "chandni chowk",
        "gurgaon",
        "gurugram",
        "noida",
        "dwarka",
        "nehru place",
        "rajouri garden",
    ],
    "Mumbai": [
        "bandra",
        "andheri",
        "colaba",
        "powai",
        "juhu",
        "lower parel",
        "fort",
        "dadar",
        "worli",
        "navi mumbai",
        "goregaon",
    ],
    "Bangalore": [
        "koramangala",
        "indiranagar",
        "whitefield",
        "mg road",
        "jayanagar",
        "hsr layout",
        "electronic city",
        "malleshwaram",
        "btm layout",
        "marathahalli",
        "yelahanka",
    ],
    "Hyderabad": [
        "hitech city",
        "gachibowli",
        "banjara hills",
        "jubilee hills",
        "secunderabad",
        "madhapur",
        "kukatpally",
        "charminar",
    ],
    "Chennai": [
        "t nagar",
        "anna nagar",
        "adyar",
        "velachery",
        "omr",
        "nungambakkam",
        "besant nagar",
        "porur",
        "egmore",
    ],
    "Pune": [
        "koregaon park",
        "hinjewadi",
        "baner",
        "kothrud",
        "viman nagar",
        "fc road",
        "hadapsar",
        "wakad",
        "shivajinagar",
    ],
    "Kolkata": [
        "park street",
        "salt lake",
        "new town",
        "howrah",
        "ballygunge",
        "esplanade",
        "gariahat",
        "dum dum",
    ],
    "Goa": [
        "panaji",
        "calangute",
        "anjuna",
        "margao",
        "vagator",
        "candolim",
        "mapusa",
        "baga",
    ],
    "Jaipur": [
        "c scheme",
        "malviya nagar",
        "vaishali nagar",
        "bapu nagar",
        "raja park",
        "tonk road",
        "mansarovar",
        "mi road",
    ],
}

MOCK_HOTELS: list[dict[str, Any]] = [
    # —— Delhi ——
    {"city": "Delhi", "name": "The Lotus Residency", "area": "Connaught Place", "price_inr": 4200, "rating": 4.5, "near_metro": True, "veg_friendly": True, "amenities": ["breakfast", "wifi", "ac"]},
    {"city": "Delhi", "name": "Metro Inn Deluxe", "area": "Karol Bagh", "price_inr": 3100, "rating": 4.1, "near_metro": True, "veg_friendly": False, "amenities": ["wifi", "parking"]},
    {"city": "Delhi", "name": "Saffron Stay", "area": "Saket", "price_inr": 4800, "rating": 4.6, "near_metro": False, "veg_friendly": True, "amenities": ["breakfast", "pool", "spa"]},
    {"city": "Delhi", "name": "Green Leaf Boutique", "area": "Hauz Khas", "price_inr": 3600, "rating": 4.3, "near_metro": True, "veg_friendly": True, "amenities": ["veg kitchen", "wifi", "workspace"]},
    {"city": "Delhi", "name": "CityPulse Hotel", "area": "Aerocity", "price_inr": 5500, "rating": 4.4, "near_metro": False, "veg_friendly": False, "amenities": ["airport shuttle", "gym"]},
    {"city": "Delhi", "name": "Dwarka Nest", "area": "Dwarka", "price_inr": 2800, "rating": 4.0, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Delhi", "name": "Noida Business Suites", "area": "Noida", "price_inr": 3900, "rating": 4.2, "near_metro": True, "veg_friendly": False, "amenities": ["wifi", "gym"]},
    # —— Mumbai ——
    {"city": "Mumbai", "name": "Sea Breeze Bandra", "area": "Bandra", "price_inr": 5200, "rating": 4.5, "near_metro": True, "veg_friendly": True, "amenities": ["breakfast", "wifi", "sea view"]},
    {"city": "Mumbai", "name": "Andheri Metro Lodge", "area": "Andheri", "price_inr": 3400, "rating": 4.1, "near_metro": True, "veg_friendly": False, "amenities": ["wifi", "airport shuttle"]},
    {"city": "Mumbai", "name": "Colaba Harbour Inn", "area": "Colaba", "price_inr": 6100, "rating": 4.6, "near_metro": False, "veg_friendly": False, "amenities": ["breakfast", "bar"]},
    {"city": "Mumbai", "name": "Powai Lake Residency", "area": "Powai", "price_inr": 4100, "rating": 4.3, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "pool", "veg kitchen"]},
    {"city": "Mumbai", "name": "Juhu Palm Stay", "area": "Juhu", "price_inr": 4800, "rating": 4.4, "near_metro": False, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    {"city": "Mumbai", "name": "Worli Skyline Hotel", "area": "Worli", "price_inr": 5700, "rating": 4.5, "near_metro": True, "veg_friendly": False, "amenities": ["gym", "wifi"]},
    {"city": "Mumbai", "name": "Dadar Central Inn", "area": "Dadar", "price_inr": 2900, "rating": 4.0, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    # —— Bangalore ——
    {"city": "Bangalore", "name": "Koramangala Tech Stay", "area": "Koramangala", "price_inr": 3800, "rating": 4.4, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "workspace", "breakfast"]},
    {"city": "Bangalore", "name": "Indiranagar Garden Inn", "area": "Indiranagar", "price_inr": 4200, "rating": 4.5, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "cafe"]},
    {"city": "Bangalore", "name": "Whitefield Business Hotel", "area": "Whitefield", "price_inr": 3500, "rating": 4.2, "near_metro": False, "veg_friendly": False, "amenities": ["wifi", "gym", "parking"]},
    {"city": "Bangalore", "name": "MG Road Heritage", "area": "MG Road", "price_inr": 5100, "rating": 4.6, "near_metro": True, "veg_friendly": False, "amenities": ["breakfast", "bar"]},
    {"city": "Bangalore", "name": "HSR Layout Nest", "area": "HSR Layout", "price_inr": 3200, "rating": 4.1, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "veg kitchen"]},
    {"city": "Bangalore", "name": "Electronic City Suites", "area": "Electronic City", "price_inr": 2900, "rating": 4.0, "near_metro": False, "veg_friendly": False, "amenities": ["wifi", "parking"]},
    {"city": "Bangalore", "name": "Malleshwaram Quiet Stay", "area": "Malleshwaram", "price_inr": 3600, "rating": 4.3, "near_metro": True, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    # —— Hyderabad ——
    {"city": "Hyderabad", "name": "Hitech City Hub", "area": "Hitech City", "price_inr": 4000, "rating": 4.4, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "workspace"]},
    {"city": "Hyderabad", "name": "Gachibowli Corporate Inn", "area": "Gachibowli", "price_inr": 3700, "rating": 4.2, "near_metro": True, "veg_friendly": False, "amenities": ["wifi", "gym"]},
    {"city": "Hyderabad", "name": "Banjara Hills Luxe", "area": "Banjara Hills", "price_inr": 5800, "rating": 4.7, "near_metro": False, "veg_friendly": False, "amenities": ["pool", "spa", "breakfast"]},
    {"city": "Hyderabad", "name": "Jubilee Veg Residency", "area": "Jubilee Hills", "price_inr": 4500, "rating": 4.5, "near_metro": False, "veg_friendly": True, "amenities": ["veg kitchen", "wifi"]},
    {"city": "Hyderabad", "name": "Secunderabad Station Hotel", "area": "Secunderabad", "price_inr": 2800, "rating": 4.0, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Hyderabad", "name": "Madhapur Flex Stay", "area": "Madhapur", "price_inr": 3300, "rating": 4.1, "near_metro": True, "veg_friendly": False, "amenities": ["wifi"]},
    # —— Chennai ——
    {"city": "Chennai", "name": "T Nagar Silk Hotel", "area": "T Nagar", "price_inr": 3600, "rating": 4.3, "near_metro": True, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    {"city": "Chennai", "name": "Anna Nagar Comfort", "area": "Anna Nagar", "price_inr": 3400, "rating": 4.2, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Chennai", "name": "Adyar River View", "area": "Adyar", "price_inr": 4700, "rating": 4.5, "near_metro": False, "veg_friendly": False, "amenities": ["breakfast", "wifi"]},
    {"city": "Chennai", "name": "Velachery IT Stay", "area": "Velachery", "price_inr": 3000, "rating": 4.0, "near_metro": True, "veg_friendly": False, "amenities": ["wifi", "workspace"]},
    {"city": "Chennai", "name": "Besant Nagar Beach Inn", "area": "Besant Nagar", "price_inr": 5200, "rating": 4.6, "near_metro": False, "veg_friendly": True, "amenities": ["sea view", "wifi"]},
    {"city": "Chennai", "name": "Egmore Central Lodge", "area": "Egmore", "price_inr": 2700, "rating": 3.9, "near_metro": True, "veg_friendly": True, "amenities": ["wifi"]},
    # —— Pune ——
    {"city": "Pune", "name": "KP Boutique Stay", "area": "Koregaon Park", "price_inr": 4100, "rating": 4.5, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "cafe"]},
    {"city": "Pune", "name": "Hinjewadi Tech Hotel", "area": "Hinjewadi", "price_inr": 3200, "rating": 4.1, "near_metro": False, "veg_friendly": False, "amenities": ["wifi", "gym", "parking"]},
    {"city": "Pune", "name": "Baner Hills Inn", "area": "Baner", "price_inr": 3500, "rating": 4.3, "near_metro": False, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    {"city": "Pune", "name": "FC Road Heritage", "area": "FC Road", "price_inr": 3900, "rating": 4.4, "near_metro": True, "veg_friendly": False, "amenities": ["wifi"]},
    {"city": "Pune", "name": "Viman Nagar Airport Stay", "area": "Viman Nagar", "price_inr": 3700, "rating": 4.2, "near_metro": False, "veg_friendly": True, "amenities": ["airport shuttle", "wifi"]},
    {"city": "Pune", "name": "Shivajinagar Metro Inn", "area": "Shivajinagar", "price_inr": 2800, "rating": 4.0, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    # —— Kolkata ——
    {"city": "Kolkata", "name": "Park Street Grand", "area": "Park Street", "price_inr": 4500, "rating": 4.5, "near_metro": True, "veg_friendly": False, "amenities": ["breakfast", "bar"]},
    {"city": "Kolkata", "name": "Salt Lake Business Hotel", "area": "Salt Lake", "price_inr": 3300, "rating": 4.2, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "workspace"]},
    {"city": "Kolkata", "name": "New Town Eco Stay", "area": "New Town", "price_inr": 3600, "rating": 4.3, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "pool"]},
    {"city": "Kolkata", "name": "Ballygunge Residency", "area": "Ballygunge", "price_inr": 4000, "rating": 4.4, "near_metro": True, "veg_friendly": False, "amenities": ["wifi"]},
    {"city": "Kolkata", "name": "Esplanade Central", "area": "Esplanade", "price_inr": 3100, "rating": 4.1, "near_metro": True, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Kolkata", "name": "Howrah Bridge Inn", "area": "Howrah", "price_inr": 2600, "rating": 3.9, "near_metro": False, "veg_friendly": True, "amenities": ["wifi"]},
    # —— Goa ——
    {"city": "Goa", "name": "Panaji Riverside", "area": "Panaji", "price_inr": 4800, "rating": 4.5, "near_metro": False, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    {"city": "Goa", "name": "Calangute Beach Stay", "area": "Calangute", "price_inr": 5500, "rating": 4.6, "near_metro": False, "veg_friendly": False, "amenities": ["pool", "beach"]},
    {"city": "Goa", "name": "Anjuna Cliff Inn", "area": "Anjuna", "price_inr": 4200, "rating": 4.3, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "cafe"]},
    {"city": "Goa", "name": "Baga Surf Lodge", "area": "Baga", "price_inr": 3900, "rating": 4.2, "near_metro": False, "veg_friendly": False, "amenities": ["wifi", "bar"]},
    {"city": "Goa", "name": "Margao City Hotel", "area": "Margao", "price_inr": 2800, "rating": 4.0, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Goa", "name": "Candolim Palm Resort", "area": "Candolim", "price_inr": 6200, "rating": 4.7, "near_metro": False, "veg_friendly": False, "amenities": ["pool", "spa", "beach"]},
    # —— Jaipur ——
    {"city": "Jaipur", "name": "C Scheme Heritage", "area": "C Scheme", "price_inr": 3800, "rating": 4.4, "near_metro": True, "veg_friendly": True, "amenities": ["breakfast", "wifi"]},
    {"city": "Jaipur", "name": "Malviya Nagar Stay", "area": "Malviya Nagar", "price_inr": 3000, "rating": 4.1, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "parking"]},
    {"city": "Jaipur", "name": "MI Road Palace Inn", "area": "MI Road", "price_inr": 4500, "rating": 4.5, "near_metro": True, "veg_friendly": False, "amenities": ["breakfast", "wifi"]},
    {"city": "Jaipur", "name": "Vaishali Garden Hotel", "area": "Vaishali Nagar", "price_inr": 3200, "rating": 4.2, "near_metro": False, "veg_friendly": True, "amenities": ["wifi", "veg kitchen"]},
    {"city": "Jaipur", "name": "Bapu Nagar Comfort", "area": "Bapu Nagar", "price_inr": 2700, "rating": 4.0, "near_metro": True, "veg_friendly": True, "amenities": ["wifi"]},
    {"city": "Jaipur", "name": "Mansarovar Business", "area": "Mansarovar", "price_inr": 2900, "rating": 4.0, "near_metro": False, "veg_friendly": False, "amenities": ["wifi", "parking"]},
]

MOCK_RESTAURANTS: list[dict[str, Any]] = [
    # —— Delhi ——
    {"city": "Delhi", "name": "Saffron Thali", "area": "Connaught Place", "cuisine": "North Indian", "rating": 4.6, "veg_only": True, "price_for_two": 800, "open_now": True, "near_metro": True},
    {"city": "Delhi", "name": "Coastal Catch", "area": "Karol Bagh", "cuisine": "South Indian", "rating": 4.3, "veg_only": False, "price_for_two": 1200, "open_now": True, "near_metro": True},
    {"city": "Delhi", "name": "Green Bowl Cafe", "area": "Hauz Khas", "cuisine": "Cafe", "rating": 4.4, "veg_only": True, "price_for_two": 600, "open_now": True, "near_metro": True},
    {"city": "Delhi", "name": "Spice Route Kitchen", "area": "Saket", "cuisine": "Indian", "rating": 4.5, "veg_only": False, "price_for_two": 1500, "open_now": False, "near_metro": False},
    {"city": "Delhi", "name": "Chandni Chowk Bites", "area": "Chandni Chowk", "cuisine": "Street Food", "rating": 4.2, "veg_only": False, "price_for_two": 500, "open_now": True, "near_metro": True},
    {"city": "Delhi", "name": "Pure Veg Delight", "area": "Lajpat Nagar", "cuisine": "North Indian", "rating": 4.1, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": True},
    {"city": "Delhi", "name": "Aerocity Grill", "area": "Aerocity", "cuisine": "Mughlai", "rating": 4.3, "veg_only": False, "price_for_two": 1800, "open_now": True, "near_metro": False},
    # —— Mumbai ——
    {"city": "Mumbai", "name": "Bandra Veg Thali", "area": "Bandra", "cuisine": "North Indian", "rating": 4.5, "veg_only": True, "price_for_two": 900, "open_now": True, "near_metro": True},
    {"city": "Mumbai", "name": "Andheri Coastal Kitchen", "area": "Andheri", "cuisine": "Seafood", "rating": 4.4, "veg_only": False, "price_for_two": 1600, "open_now": True, "near_metro": True},
    {"city": "Mumbai", "name": "Colaba Cafe Collective", "area": "Colaba", "cuisine": "Cafe", "rating": 4.3, "veg_only": True, "price_for_two": 750, "open_now": True, "near_metro": False},
    {"city": "Mumbai", "name": "Powai Biryani House", "area": "Powai", "cuisine": "Biryani", "rating": 4.6, "veg_only": False, "price_for_two": 1100, "open_now": True, "near_metro": False},
    {"city": "Mumbai", "name": "Juhu Beach Shack", "area": "Juhu", "cuisine": "Street Food", "rating": 4.2, "veg_only": False, "price_for_two": 650, "open_now": True, "near_metro": False},
    {"city": "Mumbai", "name": "Dadar Misal Spot", "area": "Dadar", "cuisine": "Street Food", "rating": 4.1, "veg_only": True, "price_for_two": 400, "open_now": True, "near_metro": True},
    {"city": "Mumbai", "name": "Worli Italian Table", "area": "Worli", "cuisine": "Italian", "rating": 4.5, "veg_only": False, "price_for_two": 2200, "open_now": True, "near_metro": True},
    # —— Bangalore ——
    {"city": "Bangalore", "name": "Koramangala Filter Coffee", "area": "Koramangala", "cuisine": "South Indian", "rating": 4.5, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": True},
    {"city": "Bangalore", "name": "Indiranagar Brew & Bowl", "area": "Indiranagar", "cuisine": "Cafe", "rating": 4.4, "veg_only": True, "price_for_two": 850, "open_now": True, "near_metro": True},
    {"city": "Bangalore", "name": "Whitefield Biryani Co", "area": "Whitefield", "cuisine": "Biryani", "rating": 4.3, "veg_only": False, "price_for_two": 1000, "open_now": True, "near_metro": False},
    {"city": "Bangalore", "name": "MG Road Chinese Wok", "area": "MG Road", "cuisine": "Chinese", "rating": 4.2, "veg_only": False, "price_for_two": 1200, "open_now": True, "near_metro": True},
    {"city": "Bangalore", "name": "HSR Pure Veg Kitchen", "area": "HSR Layout", "cuisine": "North Indian", "rating": 4.6, "veg_only": True, "price_for_two": 650, "open_now": True, "near_metro": False},
    {"city": "Bangalore", "name": "Jayanagar Udupi House", "area": "Jayanagar", "cuisine": "South Indian", "rating": 4.5, "veg_only": True, "price_for_two": 500, "open_now": True, "near_metro": True},
    {"city": "Bangalore", "name": "Electronic City Grill", "area": "Electronic City", "cuisine": "Indian", "rating": 4.0, "veg_only": False, "price_for_two": 900, "open_now": True, "near_metro": False},
    # —— Hyderabad ——
    {"city": "Hyderabad", "name": "Hitech Veg Thali", "area": "Hitech City", "cuisine": "North Indian", "rating": 4.4, "veg_only": True, "price_for_two": 750, "open_now": True, "near_metro": True},
    {"city": "Hyderabad", "name": "Gachibowli Irani Cafe", "area": "Gachibowli", "cuisine": "Cafe", "rating": 4.3, "veg_only": True, "price_for_two": 550, "open_now": True, "near_metro": True},
    {"city": "Hyderabad", "name": "Banjara Hills Biryani", "area": "Banjara Hills", "cuisine": "Biryani", "rating": 4.7, "veg_only": False, "price_for_two": 1400, "open_now": True, "near_metro": False},
    {"city": "Hyderabad", "name": "Jubilee Hills Italian", "area": "Jubilee Hills", "cuisine": "Italian", "rating": 4.5, "veg_only": False, "price_for_two": 2000, "open_now": True, "near_metro": False},
    {"city": "Hyderabad", "name": "Charminar Haleem Hub", "area": "Charminar", "cuisine": "Mughlai", "rating": 4.4, "veg_only": False, "price_for_two": 800, "open_now": True, "near_metro": False},
    {"city": "Hyderabad", "name": "Madhapur Bowl Co", "area": "Madhapur", "cuisine": "Cafe", "rating": 4.2, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": True},
    # —— Chennai ——
    {"city": "Chennai", "name": "T Nagar Filter Meals", "area": "T Nagar", "cuisine": "South Indian", "rating": 4.6, "veg_only": True, "price_for_two": 450, "open_now": True, "near_metro": True},
    {"city": "Chennai", "name": "Anna Nagar Chettinad", "area": "Anna Nagar", "cuisine": "Indian", "rating": 4.4, "veg_only": False, "price_for_two": 1100, "open_now": True, "near_metro": True},
    {"city": "Chennai", "name": "Adyar Cafe Garden", "area": "Adyar", "cuisine": "Cafe", "rating": 4.3, "veg_only": True, "price_for_two": 650, "open_now": True, "near_metro": False},
    {"city": "Chennai", "name": "Velachery Seafood Bay", "area": "Velachery", "cuisine": "Seafood", "rating": 4.2, "veg_only": False, "price_for_two": 1300, "open_now": True, "near_metro": True},
    {"city": "Chennai", "name": "Besant Nagar Beach Cafe", "area": "Besant Nagar", "cuisine": "Cafe", "rating": 4.5, "veg_only": True, "price_for_two": 800, "open_now": True, "near_metro": False},
    {"city": "Chennai", "name": "Egmore Multi Cuisine", "area": "Egmore", "cuisine": "Indian", "rating": 4.1, "veg_only": False, "price_for_two": 900, "open_now": True, "near_metro": True},
    # —— Pune ——
    {"city": "Pune", "name": "KP Garden Cafe", "area": "Koregaon Park", "cuisine": "Cafe", "rating": 4.5, "veg_only": True, "price_for_two": 900, "open_now": True, "near_metro": False},
    {"city": "Pune", "name": "Hinjewadi Lunch Box", "area": "Hinjewadi", "cuisine": "North Indian", "rating": 4.1, "veg_only": True, "price_for_two": 600, "open_now": True, "near_metro": False},
    {"city": "Pune", "name": "Baner Misal House", "area": "Baner", "cuisine": "Street Food", "rating": 4.4, "veg_only": True, "price_for_two": 350, "open_now": True, "near_metro": False},
    {"city": "Pune", "name": "FC Road Wada Pav", "area": "FC Road", "cuisine": "Street Food", "rating": 4.3, "veg_only": True, "price_for_two": 300, "open_now": True, "near_metro": True},
    {"city": "Pune", "name": "Viman Nagar Italian", "area": "Viman Nagar", "cuisine": "Italian", "rating": 4.4, "veg_only": False, "price_for_two": 1700, "open_now": True, "near_metro": False},
    {"city": "Pune", "name": "Shivajinagar Thali", "area": "Shivajinagar", "cuisine": "Indian", "rating": 4.2, "veg_only": True, "price_for_two": 550, "open_now": True, "near_metro": True},
    # —— Kolkata ——
    {"city": "Kolkata", "name": "Park Street Bistro", "area": "Park Street", "cuisine": "Cafe", "rating": 4.5, "veg_only": False, "price_for_two": 1400, "open_now": True, "near_metro": True},
    {"city": "Kolkata", "name": "Salt Lake Veg Kitchen", "area": "Salt Lake", "cuisine": "North Indian", "rating": 4.3, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": True},
    {"city": "Kolkata", "name": "New Town Chinese", "area": "New Town", "cuisine": "Chinese", "rating": 4.2, "veg_only": False, "price_for_two": 1100, "open_now": True, "near_metro": False},
    {"city": "Kolkata", "name": "Ballygunge Mishti Hub", "area": "Ballygunge", "cuisine": "Cafe", "rating": 4.4, "veg_only": True, "price_for_two": 500, "open_now": True, "near_metro": True},
    {"city": "Kolkata", "name": "Esplanade Fish Fry", "area": "Esplanade", "cuisine": "Seafood", "rating": 4.3, "veg_only": False, "price_for_two": 900, "open_now": True, "near_metro": True},
    {"city": "Kolkata", "name": "Gariahat Pure Veg", "area": "Gariahat", "cuisine": "Indian", "rating": 4.1, "veg_only": True, "price_for_two": 600, "open_now": True, "near_metro": False},
    # —— Goa ——
    {"city": "Goa", "name": "Panaji River Cafe", "area": "Panaji", "cuisine": "Cafe", "rating": 4.4, "veg_only": True, "price_for_two": 800, "open_now": True, "near_metro": False},
    {"city": "Goa", "name": "Calangute Seafood Shack", "area": "Calangute", "cuisine": "Seafood", "rating": 4.6, "veg_only": False, "price_for_two": 1500, "open_now": True, "near_metro": False},
    {"city": "Goa", "name": "Anjuna Veg Bowl", "area": "Anjuna", "cuisine": "Cafe", "rating": 4.3, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": False},
    {"city": "Goa", "name": "Baga Beach Grill", "area": "Baga", "cuisine": "Indian", "rating": 4.2, "veg_only": False, "price_for_two": 1200, "open_now": True, "near_metro": False},
    {"city": "Goa", "name": "Margao Fish Thali", "area": "Margao", "cuisine": "Seafood", "rating": 4.1, "veg_only": False, "price_for_two": 650, "open_now": True, "near_metro": False},
    {"city": "Goa", "name": "Candolim Italian Patio", "area": "Candolim", "cuisine": "Italian", "rating": 4.5, "veg_only": False, "price_for_two": 1800, "open_now": True, "near_metro": False},
    # —— Jaipur ——
    {"city": "Jaipur", "name": "C Scheme Dal Baati", "area": "C Scheme", "cuisine": "Rajasthani", "rating": 4.6, "veg_only": True, "price_for_two": 700, "open_now": True, "near_metro": True},
    {"city": "Jaipur", "name": "Malviya Nagar Thali", "area": "Malviya Nagar", "cuisine": "North Indian", "rating": 4.3, "veg_only": True, "price_for_two": 550, "open_now": True, "near_metro": False},
    {"city": "Jaipur", "name": "MI Road Lassi Cafe", "area": "MI Road", "cuisine": "Cafe", "rating": 4.4, "veg_only": True, "price_for_two": 400, "open_now": True, "near_metro": True},
    {"city": "Jaipur", "name": "Vaishali Mughlai", "area": "Vaishali Nagar", "cuisine": "Mughlai", "rating": 4.2, "veg_only": False, "price_for_two": 1100, "open_now": True, "near_metro": False},
    {"city": "Jaipur", "name": "Bapu Nagar Street Kitchen", "area": "Bapu Nagar", "cuisine": "Street Food", "rating": 4.1, "veg_only": True, "price_for_two": 350, "open_now": True, "near_metro": True},
    {"city": "Jaipur", "name": "Mansarovar Family Dhaba", "area": "Mansarovar", "cuisine": "Indian", "rating": 4.0, "veg_only": False, "price_for_two": 800, "open_now": True, "near_metro": False},
]


def normalize_city_key(city: Optional[str]) -> str:
    """Map display/alias city to inventory key (default Delhi)."""
    if not city or not str(city).strip():
        return "Delhi"
    raw = str(city).strip()
    # Title-case common forms
    titled = raw.title()
    aliases = {
        "Bengaluru": "Bangalore",
        "Bangaluru": "Bangalore",
        "Banglore": "Bangalore",
        "New Delhi": "Delhi",
        "Ncr": "Delhi",
        "Bombay": "Mumbai",
        "Madras": "Chennai",
        "Calcutta": "Kolkata",
        "Gurugram": "Delhi",
        "Gurgaon": "Delhi",
    }
    key = aliases.get(titled, titled)
    if key in DEFAULT_AREA_BY_CITY:
        return key
    # Fuzzy: case-insensitive match
    for known in DEFAULT_AREA_BY_CITY:
        if known.lower() == raw.lower():
            return known
    return "Delhi"


def default_area_for_city(city: Optional[str]) -> str:
    return DEFAULT_AREA_BY_CITY.get(normalize_city_key(city), "City Center")


def city_for_area(area: Optional[str]) -> Optional[str]:
    """Infer metro city from a known neighbourhood name."""
    if not area:
        return None
    a = str(area).strip().lower()
    for city, areas in CITY_AREAS.items():
        if a in areas or any(a == x or a in x or x in a for x in areas):
            return city
    return None


def all_parseable_areas() -> list[str]:
    """Areas sorted longest-first so 'hitech city' beats shorter tokens."""
    flat: list[str] = []
    for areas in CITY_AREAS.values():
        flat.extend(areas)
    return sorted(set(flat), key=len, reverse=True)


def hotels_for_city(city: Optional[str]) -> list[dict[str, Any]]:
    key = normalize_city_key(city)
    return [h for h in MOCK_HOTELS if h["city"] == key]


def restaurants_for_city(city: Optional[str]) -> list[dict[str, Any]]:
    key = normalize_city_key(city)
    return [r for r in MOCK_RESTAURANTS if r["city"] == key]
