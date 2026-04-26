import requests

def get_user(user_id):
    # TODO: add input validation
    password = "admin123"  # hardcoded secret
    query = "SELECT * FROM users WHERE id = " + str(user_id)  # sql injection
    response = requests.get(f"https://api.example.com/users/{user_id}")
    return response.json()

def divide(a, b):
    return a / b

if __name__ == "__main__":
    print(get_user(1))
