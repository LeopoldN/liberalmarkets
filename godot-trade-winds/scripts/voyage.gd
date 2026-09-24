extends RefCounted
## Small, renderer-independent transaction model. No browser save is modified.

var coins: int = 650
var cargo: int = 0
var capacity: int = 80
var buy_price: int = 24
var sell_price: int = 19
var trade_count: int = 0

func transact(buying: bool, quantity: int) -> String:
	if quantity <= 0:
		return "Choose at least one barrel."
	if buying:
		if quantity > capacity - cargo:
			return "There is not enough room in the hold."
		if quantity * buy_price > coins:
			return "You need more gold for that order."
		coins -= quantity * buy_price
		cargo += quantity
	else:
		if quantity > cargo:
			return "You do not have that many barrels aboard."
		coins += quantity * sell_price
		cargo -= quantity
	trade_count += 1
	return "Bought %d rum barrels for %d gold." % [quantity, quantity * buy_price] if buying else "Sold %d rum barrels for %d gold." % [quantity, quantity * sell_price]
