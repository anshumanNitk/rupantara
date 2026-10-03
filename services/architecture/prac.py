class counter:
    def __init__(self):
        self.number = 0
    def increment(self,value):
        self.number = self.number + value
        return self.number
    def decrement(self,value):
        self.number = self.number - value
        return self.number



class bank:
    def __init__(self):
        self.balance=0
    def deposit(self,value):
        self.balance = self.balance + value
        return self.balance
    def withdraw(self,value):
        if value > self.balance:
            return f"Insufficient balance. Current balance: {self.balance}"
        else:
            self.balance = self.balance - value
            return self.balance





class studentMarks:
    def __init__(self):
        self.name=""
        self.marks=[]
    def __str__(self):
        return f"Student Name: {self.name}, Marks: {self.marks}"
    def setName(self,name):
        self.name=name
    def addMarks(self,mark):
        self.marks.append(mark)
    def average(self):
        if len(self.marks) == 0:
            return 0
        return sum(self.marks)/len(self.marks)
    def highestMark(self):
        if len(self.marks) == 0:
            return None
        return max(self.marks)






class stack:
    def __init__(self):
        self.items=[]
    def push(self,item):
        self.items.append(item)
    def pop(self):
        if len(self.items) == 0:
            return "Stack is empty" 
        return self.items.pop()
    def peek(self):
        if len(self.items)==0:
            return "Stack is empty"
        return self.items[-1]
    def is_empty(self):
        return len(self.items) == 0


    
class queue:
    def __init__(self):
        self.items=[]
    def enqueue(self,item):
        self.items.append(item)
    def dequeue(self):
        if len(self.items) == 0:
            return "Queue is empty"
        return self.items.pop(0)




class balancedParentheses:
    def __init__(self):
        self.stack = []
    def is_balanced(self, expression):
        for char in expression:
            if char in "([{":
                self.stack.append(char)
            elif char in "]})":
                if not self.stack:
                    return False
                top= self.stack.pop()
                if not self.is_matching(top, char):
                    return False
        return len(self.stack) == 0
    def is_matching(self, open, close):
        pairs = { '(': ')', '{': '}', '[': ']' }
        return pairs.get(open) == close






class dictionary:
    def __init__(self):
        self.items=[None]
        self.size=0

    def _index(self,key):
        return ord(key)%len(self.items)
    def put(self,key,value):
        index=self._index(key)
        if self.items[index] is None:
            self.items[index] = []
        for pair in self.items[index]:
            if pair[0] == key:
                pair[1] = value
                return  
        self.items[index].append([key,value])
    def get(self,key):
        index=self._index(key)
        if self.items[index] is None:
            return None
        for pair in self.items[index]:
            if pair[0]==key:
                return pair[1]
    def remove(self,key):
        index=self._index(key)
        if self.items[index] is None:
            return
        for i,pair in enumerate(self.items[index]):
            if pair[0]==key:
                del self.items[index][i]
                return
    def size(self):
        count=0
        for bucket in self.items:
            if bucket is not None:
                count += len(bucket)
        return count





class simpleSet:
    def __init__(self):
        self.items=[[] for _ in range(8)]
        self.size=0
    def _index(self,item):
        return hash(item) % len(self.items)
    def add(self,item):
        index=self._index(item)
        if item not in self.items[index]:
            self.items[index].append(item)
            self.size += 1
    def contains(self,item):
        index=self._index(item)
        return item in self.items[index]







class myDict:
    def __init__(self):
        self.items=[[] for _ in range(8)]
        self.size=0

    def _index(self,key):
        return ord(key)%len(self.items)
    def put(self,key,value):
        index=self._index(key)
        if self.items[index] is None:
            self.items[index] = []
        for pair in self.items[index]:
            if pair[0] == key:
                pair[1] = value
                return  
        self.items[index].append([key,value])
    def get(self,key):
        index=self._index(key)
        if self.items[index] is None:
            return None
        for pair in self.items[index]:
            if pair[0]==key:
                return pair[1]
    def remove(self,key):
        index=self._index(key)
        if self.items[index] is None:
            return
        for i,pair in enumerate(self.items[index]):
            if pair[0]==key:
                del self.items[index][i]
                return
    def size(self):
        count=0
        for bucket in self.items:
            if bucket is not None:
                count += len(bucket)
        return count
    def count_words(self,sentence):
        words = sentence.split()
        for word in words:
            self.put(word,self.get(word)+1 if self.get(word) is not None else 1)
        
    def first_unique_character(self,s):
        for char in s:
            self.put(char,self.get(char) + 1 if self.get(char) is not None else 1)
        for char in s:
            if self.get(char)==1:
                return char
        return None



class Node:
    def __init__(self,value):
        self.value = value
        self.next=None
    def append(self,value):
        new_node = Node(value)
        current = self
        while current.next is not None:
            current = current.next
        current.next = new_node
    def prepend(self,value):
        new_node = Node(value)
        next_node = self.next
        self.next = new_node
        new_node.next = next_node

