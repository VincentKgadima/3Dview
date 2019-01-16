/*
	3d.js - This allows you to rotate an arbitary vectors in 3D space 		
*/

function Vector(optional) { 
  if (optional) {
    this.x = optional.x
    this.y = optional.y
    this.z = optional.z
    this.w = optional.w
  } else {
    this.x = 0
    this.y = 0
    this.z = 0
    this.w = 0
  }
}

Vector.prototype.x = 0.0
Vector.prototype.y = 0.0
Vector.prototype.z = 0.0
Vector.prototype.w = 0.0

Vector.prototype.length = function () {
  return Math.sqrt( this.x*this.x + this.y*this.y + this.z*this.z )
}

Vector.prototype.normalize = function() {
  //scales a vector back to a unit vector. It will have a length of 1
  var lengthval = this.length()
  if (lengthval != 0) {
    this.x /= lengthval;
    this.y /= lengthval;
    this.z /= lengthval; 
    return true 
  } else { 
    return false
  }
}

 Vector.prototype.angle = function(bvector) {
  //returns the Angle between two vectors. 0-2PI
  //we create some temporary vectors so we can normalize them savely
  var anorm = new Vector(this)  
  anorm.normalize()
  var bnorm = new Vector(bvector)
  bnorm.normalize()
  var dotval = anorm.dot(bnorm);
  return Math.acos(dotval);
}

Vector.prototype.cross = function(vectorB)
{
  var tempvec = new Vector(this) 
  tempvec.x = (this.y*vectorB.z) - (this.z*vectorB.y);
  tempvec.y = (this.z*vectorB.x) - (this.x*vectorB.z);
  tempvec.z = (this.x*vectorB.y) - (this.y*vectorB.x);
  this.x = tempvec.x
  this.y = tempvec.y
  this.z = tempvec.z
  this.w = tempvec.w
}

Vector.prototype.dot = function (vectorB)
{
  //returns the total from multiplying two vectors together. dotproduct
  return this.x*vectorB.x+this.y*vectorB.y+this.z*vectorB.z; 
}

 Vector.prototype.QuaternionMultiply = function(vectorB) {
  var out = new Vector();
  out.w = this.w*vectorB.w - this.x*vectorB.x - this.y*vectorB.y - this.z*vectorB.z;
  out.x = this.w*vectorB.x + this.x*vectorB.w + this.y*vectorB.z - this.z*vectorB.y;
  out.y = this.w*vectorB.y - this.x*vectorB.z + this.y*vectorB.w + this.z*vectorB.x;
  out.z = this.w*vectorB.z + this.x*vectorB.y - this.y*vectorB.x + this.z*vectorB.w;
  this.x = out.x
  this.y = out.y
  this.z = out.z
  this.w = out.w
}

 Vector.prototype.rotate = function (inputaxis, inputangle) {
  
  var vector = new Vector(this)
  vector.w = 0

  var axis = new Vector({ 
    x: inputaxis.x * Math.sin(inputangle/2),     
    y: inputaxis.y * Math.sin(inputangle/2),     
    z: inputaxis.z * Math.sin(inputangle/2),     
    w: Math.cos(inputangle/2)} 
    )
  
  var axisInv = new Vector({ x: -axis.x, y: -axis.y, z: -axis.z, w: axis.w}  )
  
  axis.QuaternionMultiply(vector)
  axis.QuaternionMultiply(axisInv)

  this.x = axis.x
  this.y = axis.y
  this.z = axis.z
}

 Vector.prototype.scale = function (scale) { 
  this.x *= scale
  this.y *= scale
  this.z *= scale
 }

//** ############  end class  ###################### **//

/* ############################## TESTS ########################## */
/*
var pointA = new Vector({ x: 1,  y: 0,  z: 0,  w: 0 })
var axisB = new Vector({  x: 0,  y: 0,  z: 1,  w: 0 })

var angleC = Math.PI/2;

//3d rotation
console.log("point")
console.log(pointA)

pointA.rotate(axisB, angleC);

console.log("point rotated:")
console.log("x: "+pointA.x.toFixed(20))
console.log("y: "+pointA.y.toFixed(20))
console.log("z: "+pointA.z.toFixed(20))

//length and normalizing
console.log("vectorlength:"+ pointA.length() )
console.log("normalize:"+ pointA.normalize() )
console.log("vectorlength:"+ pointA.length() )

//angles
console.log("angle between A and B:"+ axisB.angle(pointA) )

//creating a new vector from an old one.
var vectorC = new Vector(pointA);
console.log("x: "+vectorC.x.toFixed(20))
console.log("y: "+vectorC.y.toFixed(20))
console.log("z: "+vectorC.z.toFixed(20))
console.log(vectorC)
*/